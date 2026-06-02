import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { Config } from "./config.js";
import { runDeveloperAgent } from "./agent.js";

interface GitHubIssueEvent {
  issue?: {
    number: number;
    title: string;
    body: string;
    html_url: string;
  };
  repository?: {
    name: string;
    owner: {
      login: string;
    };
    default_branch?: string;
  };
}

/**
 * Orchestrates the Developer Agent flow:
 * 1. Reads issue title and description.
 * 2. Runs the autonomous developer loop.
 * 3. Commits and pushes changes to a patch branch.
 * 4. Creates a Pull Request and links it back to the issue.
 */
export async function developIssue(config: Config): Promise<void> {
  const { issueFile, githubEventPath, githubToken, githubRepository } = config;

  let eventPayload: GitHubIssueEvent = {};

  // 1. Resolve issue details
  if (issueFile) {
    const fullPath = path.resolve(process.cwd(), issueFile);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Issue file not found: ${fullPath}`);
    }
    eventPayload = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
  } else if (githubEventPath && fs.existsSync(githubEventPath)) {
    try {
      eventPayload = JSON.parse(fs.readFileSync(githubEventPath, "utf-8"));
    } catch (err) {
      throw new Error(`Failed to parse GitHub event JSON: ${err}`);
    }
  } else {
    throw new Error(
      "No issue file or GITHUB_EVENT_PATH provided. Use --issue-file to test locally."
    );
  }

  const issue = eventPayload.issue;
  if (!issue || !issue.number) {
    throw new Error("Could not find issue details in the event payload.");
  }

  const issueTitle = issue.title;
  const issueBody = issue.body || "";
  const issueNumber = issue.number;
  const defaultBranch = eventPayload.repository?.default_branch || config.branch || "master";

  console.log(`\n📋 Processing Issue #${issueNumber}: "${issueTitle}"`);
  console.log(`Target base branch: "${defaultBranch}"`);

  // 2. Execute developer agent
  const summaryOfChanges = await runDeveloperAgent(config, issueTitle, issueBody);

  // If mock mode is active, simulate git and GitHub operations
  if (config.mock) {
    console.log("\n[MOCK] Git and GitHub Action Simulation:");
    console.log(`[MOCK] Git Branch Created: "ai-patch/issue-${issueNumber}"`);
    console.log(`[MOCK] Git Commit: "AI: fix/implement issue #${issueNumber} - ${issueTitle}"`);
    console.log(`[MOCK] Git Push: Pushed branch "ai-patch/issue-${issueNumber}" to origin`);
    console.log(`[MOCK] GitHub PR Opened: Created PR from "ai-patch/issue-${issueNumber}" into "${defaultBranch}"`);
    console.log(`[MOCK] GitHub PR Url: https://github.com/${githubRepository || "owner/repo"}/pull/123`);
    console.log(`[MOCK] GitHub Comment Posted: Link left on Issue #${issueNumber}`);
    return;
  }

  // 3. Check for workspace modifications
  let gitStatus = "";
  try {
    gitStatus = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
  } catch (err) {
    console.warn("Warning: Failed to run git status. Assuming no changes.");
  }

  if (!gitStatus) {
    console.log("No files were modified by the developer agent. Exiting without PR.");
    return;
  }

  console.log("\nFiles modified:\n" + gitStatus);

  // 4. Git Branch, Commit, and Push
  const patchBranch = `ai-patch/issue-${issueNumber}`;
  console.log(`Creating branch: "${patchBranch}"...`);

  try {
    // Configure Git identity
    execSync('git config user.name "github-actions[bot]"', { stdio: "inherit" });
    execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"', {
      stdio: "inherit",
    });

    // Checkout new branch
    execSync(`git checkout -b ${patchBranch}`, { stdio: "inherit" });

    // Stage and commit changes
    execSync("git add .", { stdio: "inherit" });
    execSync(`git commit -m "AI: resolve issue #${issueNumber} - ${issueTitle}"`, {
      stdio: "inherit",
    });

    // Push changes
    console.log(`Pushing branch "${patchBranch}" to origin...`);
    execSync(`git push origin ${patchBranch} --force`, { stdio: "inherit" });
  } catch (err: any) {
    throw new Error(`Git checkout/commit/push failed: ${err.message}`);
  }

  // 5. Open Pull Request
  if (!githubToken || !githubRepository) {
    console.log("GITHUB_TOKEN or GITHUB_REPOSITORY is missing. Skipping Pull Request creation.");
    return;
  }

  const prUrl = `https://api.github.com/repos/${githubRepository}/pulls`;
  const prBody = {
    title: `AI: Resolve Issue #${issueNumber} - ${issueTitle}`,
    head: patchBranch,
    base: defaultBranch,
    body: `Closes #${issueNumber}\n\n### 🤖 Autonomous Developer Changes Summary\n\n${summaryOfChanges}`,
  };

  console.log("Opening GitHub Pull Request...");
  const prResponse = await fetch(prUrl, {
    method: "POST",
    headers: {
      "Authorization": `token ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-reviewer-action",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(prBody),
  });

  if (!prResponse.ok) {
    const errorText = await prResponse.text();
    console.error(`Failed to create Pull Request: ${prResponse.status}\n${errorText}`);
    return;
  }

  const prData = (await prResponse.json()) as any;
  const prHtmlUrl = prData.html_url;
  const prNumber = prData.number;
  console.log(`Successfully created Pull Request #${prNumber}: ${prHtmlUrl}`);

  // 6. Comment on Issue linking to PR
  const commentUrl = `https://api.github.com/repos/${githubRepository}/issues/${issueNumber}/comments`;
  const commentBody = {
    body: `🤖 Beep boop! I have attempted to resolve this issue in Pull Request #${prNumber} (${prHtmlUrl}).`,
  };

  console.log(`Adding link comment to Issue #${issueNumber}...`);
  const commentResponse = await fetch(commentUrl, {
    method: "POST",
    headers: {
      "Authorization": `token ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-reviewer-action",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commentBody),
  });

  if (!commentResponse.ok) {
    const errorText = await commentResponse.text();
    console.error(`Failed to post issue comment: ${commentResponse.status}\n${errorText}`);
  } else {
    console.log("Successfully posted issue comment.");
  }
}
