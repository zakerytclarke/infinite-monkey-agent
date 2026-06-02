#!/usr/bin/env node

import { loadConfig, Config } from "./config.js";
import { getDiff, parseDiff } from "./git.js";
import { runTests } from "./tester.js";
import { getReviewFromLLM } from "./llm.js";
import { printConsoleReview } from "./cli.js";
import { postGitHubReview, printWorkflowAnnotations } from "./github.js";
import { developIssue } from "./develop.js";

async function runReviewMode(config: Config) {
  // 1. Run tests if configured
  let testPassed = true;
  let testOutput: string | undefined = undefined;

  if (config.runTests) {
    const testResult = runTests(config.testCommand);
    if (testResult.run) {
      testPassed = testResult.passed;
      if (!testPassed) {
        testOutput = testResult.output;
        console.warn("⚠️ Warning: Verification tests failed. Test failures will be sent to the AI for analysis.");
      } else {
        console.log("✅ Verification tests passed.");
      }
    } else {
      console.log("No tests detected or run.");
    }
  }

  // 2. Fetch and parse diff
  console.log(`Fetching git diff...`);
  const diffText = getDiff(config.diffFile, config.branch);
  if (!diffText.trim()) {
    console.log("No code changes found to review.");
    return;
  }

  const fileDiffs = parseDiff(diffText);
  if (fileDiffs.length === 0) {
    console.log("No parseable file diffs found.");
    return;
  }

  console.log(`Found ${fileDiffs.length} modified file(s) to review.`);

  // 3. Get reviews from LLM
  const reviewResult = await getReviewFromLLM(config, fileDiffs, testOutput);

  // 4. Output results based on execution environment
  const isGitHubAction = !!process.env.GITHUB_ACTIONS;

  if (isGitHubAction) {
    console.log("Running in GitHub Actions environment.");
    
    // Output workflow annotations
    printWorkflowAnnotations(reviewResult.reviews);

    // Post reviews to PR if token is available
    if (config.githubToken) {
      await postGitHubReview(config, fileDiffs, reviewResult.reviews, testPassed);
    } else {
      console.log("GITHUB_TOKEN not provided, skipping inline PR comment posting.");
    }
  } else {
    // Print locally in terminal
    printConsoleReview(reviewResult.reviews);
  }
}

async function main() {
  try {
    const config = loadConfig(process.argv.slice(2));

    console.log("Initializing AI Reviewer & Developer CLI...");

    // Auto-detect mode if not explicitly set via subcommand
    let runMode = config.subcommand;
    if (!runMode) {
      if (config.githubEventName === "issues") {
        runMode = "develop";
      } else {
        runMode = "review"; // default behavior
      }
    }

    if (runMode === "develop") {
      console.log("Mode: Autonomous Developer Agent");
      await developIssue(config);
    } else {
      console.log("Mode: Code Review Judge");
      await runReviewMode(config);
    }

    // Exit successfully
    process.exit(0);
  } catch (err: any) {
    console.error("❌ Critical Error running AI CLI:");
    console.error(err.message || err);
    process.exit(1);
  }
}

main();
