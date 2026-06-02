import fs from "fs";
import { Config } from "./config.js";
import { FileDiff } from "./git.js";
import { ReviewAnnotation } from "./llm.js";

/**
 * Filter review annotations to ensure they only target lines actually added/modified in the diff.
 * This prevents the GitHub API from rejecting reviews due to invalid line offsets.
 */
export function filterValidAnnotations(
  fileDiffs: FileDiff[],
  annotations: ReviewAnnotation[]
): ReviewAnnotation[] {
  return annotations.filter(ann => {
    const fd = fileDiffs.find(f => f.file === ann.file);
    if (!fd) return false;

    // Check if the line is an added line in any of the hunks
    const isAdded = fd.hunks.some(hunk =>
      hunk.lines.some(line => line.type === "added" && line.newLineNumber === ann.line)
    );
    return isAdded;
  });
}

/**
 * Print annotations in the GitHub Actions workflow format.
 * E.g., ::warning file=src/index.ts,line=10::Some message
 */
export function printWorkflowAnnotations(annotations: ReviewAnnotation[]): void {
  for (const ann of annotations) {
    const level = ann.level === "notice" ? "notice" : ann.level === "error" ? "error" : "warning";
    // GitHub action commands require escaping newlines
    const message = ann.message.replace(/\r?\n/g, "%0A");
    console.log(`::${level} file=${ann.file},line=${ann.line}::${message}`);
  }
}

interface GitHubEvent {
  pull_request?: {
    number: number;
    head: {
      sha: string;
    };
  };
}

/**
 * Post a review to the GitHub PR.
 */
export async function postGitHubReview(
  config: Config,
  fileDiffs: FileDiff[],
  annotations: ReviewAnnotation[],
  testPassed: boolean
): Promise<void> {
  const { githubToken, githubRepository, githubEventPath } = config;
  if (!githubToken || !githubRepository || !githubEventPath) {
    console.log("Skipping GitHub PR review posting (missing token, repository, or event path).");
    return;
  }

  if (!fs.existsSync(githubEventPath)) {
    console.warn(`GitHub event file not found at ${githubEventPath}`);
    return;
  }

  let event: GitHubEvent;
  try {
    event = JSON.parse(fs.readFileSync(githubEventPath, "utf-8"));
  } catch (err) {
    console.error("Failed to parse GitHub event JSON:", err);
    return;
  }

  const prNumber = event.pull_request?.number;
  const commitId = event.pull_request?.head?.sha || config.githubSha;

  if (!prNumber) {
    console.log("Event is not a pull request. Skipping review comment posting.");
    return;
  }

  if (!commitId) {
    console.warn("Could not determine HEAD commit SHA. Skipping review comment posting.");
    return;
  }

  const validAnnotations = filterValidAnnotations(fileDiffs, annotations);
  console.log(
    `Filtered ${annotations.length} annotations to ${validAnnotations.length} valid diff line comments.`
  );

  const comments = validAnnotations.map(ann => ({
    path: ann.file,
    line: ann.line,
    side: "RIGHT",
    body: `### AI Review: ${ann.level === "error" ? "❌ Error" : ann.level === "warning" ? "⚠️ Warning" : "💡 Suggestion"}\n\n${ann.message}`,
  }));

  const url = `https://api.github.com/repos/${githubRepository}/pulls/${prNumber}/reviews`;
  
  let summaryBody = "### 🤖 AI Code Review Summary\n\n";
  if (testPassed) {
    summaryBody += "✅ Verification tests passed successfully!\n\n";
  } else {
    summaryBody += "❌ Verification tests failed. Please check the logs.\n\n";
  }

  if (validAnnotations.length === 0) {
    summaryBody += "LGTM! I reviewed the diff and found no issues.";
  } else {
    summaryBody += `I have left ${validAnnotations.length} inline suggestion(s)/comment(s) on the changes.`;
  }

  const body = {
    commit_id: commitId,
    event: "COMMENT",
    body: summaryBody,
    comments: comments.length > 0 ? comments : undefined,
  };

  console.log(`Submitting review to GitHub PR #${prNumber}...`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `token ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-reviewer-action",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to post review to GitHub: ${response.status} ${response.statusText}\n${errorText}`);
  } else {
    console.log("Successfully posted review to GitHub PR.");
  }
}
