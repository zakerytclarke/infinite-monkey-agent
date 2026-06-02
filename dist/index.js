#!/usr/bin/env node

// src/config.ts
import fs from "fs";
import path from "path";
function loadConfig(args) {
  let subcommand = void 0;
  const remainingArgs = [...args];
  if (remainingArgs.length > 0 && !remainingArgs[0].startsWith("-")) {
    const cmd = remainingArgs[0].toLowerCase();
    if (cmd === "review" || cmd === "develop") {
      subcommand = cmd;
      remainingArgs.shift();
    }
  }
  const config = {
    subcommand,
    model: "google/gemini-2.5-pro",
    runTests: true,
    branch: "master",
    mock: false,
    maxSteps: 15,
    githubEventPath: process.env.GITHUB_EVENT_PATH,
    githubRepository: process.env.GITHUB_REPOSITORY,
    githubRef: process.env.GITHUB_REF,
    githubSha: process.env.GITHUB_SHA,
    githubEventName: process.env.GITHUB_EVENT_NAME
  };
  const possibleConfigFiles = ["ai-reviewer.json", ".ai-reviewer.json"];
  for (const filename of possibleConfigFiles) {
    const fullPath = path.resolve(process.cwd(), filename);
    if (fs.existsSync(fullPath)) {
      try {
        const fileContent = fs.readFileSync(fullPath, "utf-8");
        const parsed = JSON.parse(fileContent);
        Object.assign(config, parsed);
        break;
      } catch (err) {
        console.warn(`Warning: Failed to parse configuration file ${filename}:`, err);
      }
    }
  }
  const env = process.env;
  const openrouterKey = env.INPUT_OPENROUTER_API_KEY || env.OPENROUTER_API_KEY;
  if (openrouterKey)
    config.openrouterApiKey = openrouterKey;
  const openaiKey = env.INPUT_OPENAI_API_KEY || env.OPENAI_API_KEY;
  if (openaiKey)
    config.openaiApiKey = openaiKey;
  const geminiKey = env.INPUT_GEMINI_API_KEY || env.GEMINI_API_KEY;
  if (geminiKey)
    config.geminiApiKey = geminiKey;
  const ghToken = env.INPUT_GITHUB_TOKEN || env.GITHUB_TOKEN || env.GH_TOKEN;
  if (ghToken)
    config.githubToken = ghToken;
  const inputModel = env.INPUT_MODEL || env.AI_REVIEWER_MODEL;
  if (inputModel)
    config.model = inputModel;
  const inputPrompt = env.INPUT_CUSTOM_PROMPT || env.AI_REVIEWER_PROMPT;
  if (inputPrompt)
    config.customPrompt = inputPrompt;
  const inputRunTests = env.INPUT_RUN_TESTS || env.AI_REVIEWER_RUN_TESTS;
  if (inputRunTests !== void 0) {
    config.runTests = inputRunTests.toString().toLowerCase() !== "false";
  }
  const inputTestCommand = env.INPUT_TEST_COMMAND || env.AI_REVIEWER_TEST_COMMAND;
  if (inputTestCommand)
    config.testCommand = inputTestCommand;
  const inputMock = env.INPUT_MOCK || env.AI_REVIEWER_MOCK;
  if (inputMock !== void 0) {
    config.mock = inputMock.toString().toLowerCase() === "true";
  }
  const inputMaxSteps = env.INPUT_MAX_STEPS || env.AI_REVIEWER_MAX_STEPS;
  if (inputMaxSteps) {
    const val = parseInt(inputMaxSteps.toString(), 10);
    if (!isNaN(val))
      config.maxSteps = val;
  }
  for (let i = 0; i < remainingArgs.length; i++) {
    const arg = remainingArgs[i];
    if (arg === "--branch" || arg === "-b") {
      const val = remainingArgs[++i];
      if (val)
        config.branch = val;
    } else if (arg === "--model" || arg === "-m") {
      const val = remainingArgs[++i];
      if (val)
        config.model = val;
    } else if (arg === "--prompt" || arg === "-p") {
      const val = remainingArgs[++i];
      if (val) {
        if (fs.existsSync(path.resolve(process.cwd(), val))) {
          config.customPrompt = fs.readFileSync(path.resolve(process.cwd(), val), "utf-8");
        } else {
          config.customPrompt = val;
        }
      }
    } else if (arg === "--diff-file" || arg === "-d") {
      const val = remainingArgs[++i];
      if (val)
        config.diffFile = val;
    } else if (arg === "--issue-file") {
      const val = remainingArgs[++i];
      if (val)
        config.issueFile = val;
    } else if (arg === "--max-steps") {
      const val = remainingArgs[++i];
      if (val) {
        const parsedSteps = parseInt(val, 10);
        if (!isNaN(parsedSteps))
          config.maxSteps = parsedSteps;
      }
    } else if (arg === "--run-tests") {
      config.runTests = true;
    } else if (arg === "--no-tests") {
      config.runTests = false;
    } else if (arg === "--test-command") {
      const val = remainingArgs[++i];
      if (val)
        config.testCommand = val;
    } else if (arg === "--mock") {
      config.mock = true;
    }
  }
  return config;
}

// src/git.ts
import { execSync } from "child_process";
import fs2 from "fs";
import path2 from "path";
function getDiff(diffFile, branch = "master") {
  if (diffFile) {
    const fullPath = path2.resolve(process.cwd(), diffFile);
    if (!fs2.existsSync(fullPath)) {
      throw new Error(`Diff file not found: ${fullPath}`);
    }
    return fs2.readFileSync(fullPath, "utf-8");
  }
  try {
    execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" });
  } catch {
    throw new Error("Not a git repository and no --diff-file was provided.");
  }
  try {
    try {
      execSync(`git fetch origin ${branch}`, { stdio: "ignore" });
    } catch {
    }
    let target = branch;
    try {
      execSync(`git rev-parse --verify origin/${branch}`, { stdio: "ignore" });
      target = `origin/${branch}`;
    } catch {
    }
    return execSync(`git diff ${target}...HEAD`, { encoding: "utf-8" });
  } catch (err) {
    try {
      return execSync(`git diff ${branch}`, { encoding: "utf-8" });
    } catch (err2) {
      throw new Error(`Failed to get git diff against ${branch}: ${err2?.message || err2}`);
    }
  }
}
function parseDiff(diffText) {
  const fileDiffs = [];
  const lines = diffText.split(/\r?\n/);
  let currentFile = null;
  let currentHunk = null;
  let newLineNum = 0;
  let oldLineNum = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("diff --git ")) {
      currentFile = {
        file: "",
        isNew: false,
        isDeleted: false,
        hunks: [],
        rawContent: line + "\n"
      };
      fileDiffs.push(currentFile);
      currentHunk = null;
      continue;
    }
    if (!currentFile) {
      continue;
    }
    currentFile.rawContent += line + "\n";
    if (line.startsWith("new file mode ")) {
      currentFile.isNew = true;
      continue;
    }
    if (line.startsWith("deleted file mode ")) {
      currentFile.isDeleted = true;
      continue;
    }
    if (line.startsWith("--- ")) {
      continue;
    }
    if (line.startsWith("+++ ")) {
      const match = line.match(/^\+\+\+\s+b\/(.+)$/);
      if (match) {
        currentFile.file = match[1];
      } else if (line.includes("/dev/null")) {
        const prevLine = lines[i - 1];
        const prevMatch = prevLine.match(/^---\s+a\/(.+)$/);
        if (prevMatch) {
          currentFile.file = prevMatch[1];
        }
      }
      continue;
    }
    if (line.startsWith("@@ ")) {
      const match = line.match(/^@@\s+-(\d+),?(\d*)\s+\+(\d+),?(\d*)\s+@@/);
      if (match) {
        const oldStart = parseInt(match[1], 10);
        const oldLines = match[2] ? parseInt(match[2], 10) : 1;
        const newStart = parseInt(match[3], 10);
        const newLines = match[4] ? parseInt(match[4], 10) : 1;
        currentHunk = {
          header: line,
          oldStart,
          oldLines,
          newStart,
          newLines,
          lines: []
        };
        currentFile.hunks.push(currentHunk);
        oldLineNum = oldStart;
        newLineNum = newStart;
      }
      continue;
    }
    if (currentHunk) {
      if (line.startsWith("+")) {
        currentHunk.lines.push({
          type: "added",
          content: line.slice(1),
          newLineNumber: newLineNum
        });
        newLineNum++;
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({
          type: "deleted",
          content: line.slice(1),
          oldLineNumber: oldLineNum
        });
        oldLineNum++;
      } else if (line.startsWith(" ") || line === "") {
        currentHunk.lines.push({
          type: "normal",
          content: line.startsWith(" ") ? line.slice(1) : line,
          newLineNumber: newLineNum,
          oldLineNumber: oldLineNum
        });
        newLineNum++;
        oldLineNum++;
      }
    }
  }
  return fileDiffs.filter((f) => f.file !== "");
}
function getFullFileContent(filePath) {
  const fullPath = path2.resolve(process.cwd(), filePath);
  if (fs2.existsSync(fullPath) && fs2.statSync(fullPath).isFile()) {
    try {
      return fs2.readFileSync(fullPath, "utf-8");
    } catch {
      return null;
    }
  }
  return null;
}

// src/tester.ts
import { execSync as execSync2 } from "child_process";
import fs3 from "fs";
import path3 from "path";
function runTests(customCommand) {
  let command = customCommand;
  if (!command) {
    const cwd = process.cwd();
    const packageJsonPath = path3.join(cwd, "package.json");
    if (fs3.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs3.readFileSync(packageJsonPath, "utf-8"));
        if (pkg.scripts && pkg.scripts.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
          command = "npm test";
        }
      } catch {
      }
    }
    if (!command && fs3.existsSync(path3.join(cwd, "Cargo.toml"))) {
      command = "cargo test";
    }
    if (!command) {
      const hasPython = fs3.existsSync(path3.join(cwd, "requirements.txt")) || fs3.existsSync(path3.join(cwd, "pyproject.toml")) || fs3.existsSync(path3.join(cwd, "setup.py"));
      if (hasPython) {
        command = "pytest";
      }
    }
    if (!command && fs3.existsSync(path3.join(cwd, "go.mod"))) {
      command = "go test ./...";
    }
  }
  if (!command) {
    return { run: false, passed: true };
  }
  console.log(`Running tests via: "${command}"...`);
  try {
    const output = execSync2(command, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 6e4
    });
    return {
      run: true,
      passed: true,
      command,
      output
    };
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString() : "";
    const stderr = err.stderr ? err.stderr.toString() : "";
    const combinedOutput = `${stdout}
${stderr}`.trim();
    return {
      run: true,
      passed: false,
      command,
      output: combinedOutput || err.message,
      error: err.message
    };
  }
}

// src/llm.ts
function generateMockReview(fileDiffs, testOutput) {
  const reviews = [];
  for (const fd of fileDiffs) {
    for (const hunk of fd.hunks) {
      for (const line of hunk.lines) {
        if (line.type !== "added" || !line.newLineNumber)
          continue;
        const content = line.content;
        if (fd.file.includes("users.ts") && content.includes("LIKE '%${name}%'")) {
          reviews.push({
            file: fd.file,
            line: line.newLineNumber,
            level: "error",
            message: "Critical SQL Injection vulnerability. User input `name` is directly interpolated into the query string. Use parameterized queries instead (e.g. `db.query('... WHERE name LIKE $1', ['%' + name + '%'])`)."
          });
        } else if (fd.file.includes("users.ts") && content.includes("email = '${email}'")) {
          reviews.push({
            file: fd.file,
            line: line.newLineNumber,
            level: "error",
            message: "Critical SQL Injection vulnerability. User input `email` is directly interpolated into the query string. Use parameterized queries instead."
          });
        } else if (fd.file.includes("users.ts") && content.includes("role = '${role}'")) {
          reviews.push({
            file: fd.file,
            line: line.newLineNumber,
            level: "error",
            message: "Critical SQL Injection vulnerability. User input `role` is directly interpolated into the query string. Use parameterized queries instead."
          });
        } else if (fd.file.includes("payment-gateway.ts") && content.includes("sk_live_")) {
          reviews.push({
            file: fd.file,
            line: line.newLineNumber,
            level: "error",
            message: "Security issue: Hardcoded Stripe live API key detected. Sensitive credentials should never be committed to source control. Move this to an environment variable or use a secrets manager."
          });
        } else if (fd.file.includes("offer-eligibility.ts") && content.includes("new Date()")) {
          reviews.push({
            file: fd.file,
            line: line.newLineNumber,
            level: "warning",
            message: "Timezone issue: Comparing `offer.expiryDate` against `new Date()` uses the server's local timezone, which might cause inconsistent eligibility checks depending on where the application is deployed. Consider using UTC dates or an explicit timezone library."
          });
        } else if (fd.file.includes("notification-service.ts") && content.includes("await fetch")) {
          reviews.push({
            file: fd.file,
            line: line.newLineNumber,
            level: "warning",
            message: "Performance issue: Sending notifications sequentially using `await fetch` inside a loop will be slow for large lists of users. Consider using `Promise.all` with a concurrency limit (e.g. p-limit) or a background queue to send notifications asynchronously."
          });
        } else if (fd.file.includes("compound-agent.ts") && content.includes("obs.confidence < 0.7")) {
          reviews.push({
            file: fd.file,
            line: line.newLineNumber,
            level: "notice",
            message: "Code smell: Hardcoded confidence threshold value `0.7`. Consider moving this threshold to a config file or environment variable so it can be tuned without changing the code."
          });
        }
      }
    }
  }
  if (reviews.length === 0) {
    for (const fd of fileDiffs) {
      if (fd.isDeleted)
        continue;
      const firstAdded = fd.hunks[0]?.lines.find((l) => l.type === "added" && l.newLineNumber);
      if (firstAdded && firstAdded.newLineNumber) {
        reviews.push({
          file: fd.file,
          line: firstAdded.newLineNumber,
          level: "notice",
          message: "Code change looks solid. Please ensure appropriate unit tests are updated to cover this new logic."
        });
        break;
      }
    }
  }
  return { reviews };
}
async function getReviewFromLLM(config, fileDiffs, testOutput) {
  if (config.mock) {
    console.log("Using mock code reviewer reviews...");
    return generateMockReview(fileDiffs, testOutput);
  }
  const apiKey = config.openrouterApiKey || config.openaiApiKey || config.geminiApiKey;
  if (!apiKey) {
    throw new Error(
      "No API key provided. Please set OPENROUTER_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY."
    );
  }
  let filesContext = "";
  for (const fd of fileDiffs) {
    if (fd.isDeleted)
      continue;
    const content = getFullFileContent(fd.file);
    if (content) {
      const truncated = content.length > 15e4 ? content.slice(0, 15e4) + "\n...[TRUNCATED]..." : content;
      filesContext += `
--- File: ${fd.file} ---
${truncated}
`;
    }
  }
  let systemPrompt = `You are an expert software engineer and code reviewer.
Your task is to review the git diff of a project, identify bugs, security vulnerabilities, performance issues, logic flaws, code style issues, or general improvements, and provide precise line-level feedback.

You MUST respond with a JSON object in this exact format:
{
  "reviews": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "level": "warning",
      "message": "Vulnerability or bug description. Explain the issue and suggest a fix."
    }
  ]
}

Level must be one of: "notice", "warning", "error".
- "notice": Simple suggestions, style issues, refactoring ideas.
- "warning": Potential bugs, performance issues, code smell.
- "error": Serious bugs, security flaws (e.g. SQL injection, exposed API keys), compilation errors.

CRITICAL RULES:
1. ONLY comment on line numbers that exist in the *new* version of the files and are actually modified or added in the diff. Check the diff lines starting with '+' and map them to their line numbers in the new file.
2. DO NOT comment on unmodified lines.
3. Be specific and constructive. Provide example code fixes where appropriate.
`;
  if (config.customPrompt) {
    systemPrompt += `
Additional user guidelines/preferences:
${config.customPrompt}
`;
  }
  let userPrompt = `Here is the git diff:
\`\`\`diff
${fileDiffs.map((fd) => fd.rawContent).join("\n")}
\`\`\`
`;
  if (filesContext) {
    userPrompt += `
Here are the full contents of the modified files for surrounding context:
${filesContext}
`;
  }
  if (testOutput) {
    userPrompt += `
IMPORTANT: The project test suite failed during verification with the following logs:
\`\`\`
${testOutput}
\`\`\`
Please analyze if any of the changes in the diff broke the tests. If so, leave a review comment on the problematic line(s) explaining how the change caused the test failure.
`;
  }
  let url = "";
  let headers = {
    "Content-Type": "application/json"
  };
  let body = {};
  if (config.openrouterApiKey) {
    url = "https://openrouter.ai/api/v1/chat/completions";
    headers["Authorization"] = `Bearer ${config.openrouterApiKey}`;
    headers["HTTP-Referer"] = "https://github.com/zakerytclarke/ai-reviewer";
    headers["X-Title"] = "AI Code Reviewer";
    body = {
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    };
  } else if (config.openaiApiKey) {
    url = "https://api.openai.com/v1/chat/completions";
    headers["Authorization"] = `Bearer ${config.openaiApiKey}`;
    body = {
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    };
  } else if (config.geminiApiKey) {
    const modelName = config.model.includes("/") ? config.model.split("/")[1] : config.model;
    url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.geminiApiKey}`;
    body = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}

${userPrompt}` }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            reviews: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  file: { type: "STRING" },
                  line: { type: "INTEGER" },
                  level: { type: "STRING", enum: ["notice", "warning", "error"] },
                  message: { type: "STRING" }
                },
                required: ["file", "line", "level", "message"]
              }
            }
          },
          required: ["reviews"]
        }
      }
    };
  }
  console.log(`Sending diff to AI model (${config.model})...`);
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API request failed: ${response.status} ${response.statusText}
${errorText}`);
  }
  const resultData = await response.json();
  let rawResponseText = "";
  if (config.openrouterApiKey || config.openaiApiKey) {
    rawResponseText = resultData.choices?.[0]?.message?.content || "";
  } else if (config.geminiApiKey) {
    rawResponseText = resultData.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
  if (!rawResponseText) {
    throw new Error("Received empty response from the AI model.");
  }
  try {
    const jsonResult = JSON.parse(rawResponseText);
    if (!jsonResult.reviews || !Array.isArray(jsonResult.reviews)) {
      return { reviews: [] };
    }
    return jsonResult;
  } catch (err) {
    console.error("Failed to parse JSON response from LLM:", rawResponseText);
    throw new Error(`Invalid JSON returned from model: ${err.message}`);
  }
}

// src/cli.ts
var RESET = "\x1B[0m";
var BOLD = "\x1B[1m";
var RED = "\x1B[31m";
var YELLOW = "\x1B[33m";
var BLUE = "\x1B[34m";
var GRAY = "\x1B[90m";
var GREEN = "\x1B[32m";
function printConsoleReview(annotations) {
  console.log(`
${BOLD}=== AI Code Review Results ===${RESET}
`);
  if (annotations.length === 0) {
    console.log(`${GREEN}\u2714 No issues found. Looks good!${RESET}
`);
    return;
  }
  const errors = annotations.filter((a) => a.level === "error");
  const warnings = annotations.filter((a) => a.level === "warning");
  const notices = annotations.filter((a) => a.level === "notice");
  console.log(
    `Found ${BOLD}${annotations.length}${RESET} issue(s): ${RED}${errors.length} error(s)${RESET}, ${YELLOW}${warnings.length} warning(s)${RESET}, ${BLUE}${notices.length} suggestion(s)${RESET}
`
  );
  const groupedByFile = annotations.reduce((acc, ann) => {
    if (!acc[ann.file])
      acc[ann.file] = [];
    acc[ann.file].push(ann);
    return acc;
  }, {});
  for (const [file, fileAnns] of Object.entries(groupedByFile)) {
    console.log(`${BOLD}${file}${RESET}`);
    const sorted = [...fileAnns].sort((a, b) => a.line - b.line);
    for (const ann of sorted) {
      let badge = "";
      let color = "";
      if (ann.level === "error") {
        badge = " \u2716 ERROR ";
        color = RED;
      } else if (ann.level === "warning") {
        badge = " \u26A0 WARN  ";
        color = YELLOW;
      } else {
        badge = " \u2139 INFO  ";
        color = BLUE;
      }
      console.log(
        `  ${color}${BOLD}${badge}${RESET} ${GRAY}Line ${ann.line}:${RESET} ${ann.message}
`
      );
    }
  }
}

// src/github.ts
import fs4 from "fs";
function filterValidAnnotations(fileDiffs, annotations) {
  return annotations.filter((ann) => {
    const fd = fileDiffs.find((f) => f.file === ann.file);
    if (!fd)
      return false;
    const isAdded = fd.hunks.some(
      (hunk) => hunk.lines.some((line) => line.type === "added" && line.newLineNumber === ann.line)
    );
    return isAdded;
  });
}
function printWorkflowAnnotations(annotations) {
  for (const ann of annotations) {
    const level = ann.level === "notice" ? "notice" : ann.level === "error" ? "error" : "warning";
    const message = ann.message.replace(/\r?\n/g, "%0A");
    console.log(`::${level} file=${ann.file},line=${ann.line}::${message}`);
  }
}
async function postGitHubReview(config, fileDiffs, annotations, testPassed) {
  const { githubToken, githubRepository, githubEventPath } = config;
  if (!githubToken || !githubRepository || !githubEventPath) {
    console.log("Skipping GitHub PR review posting (missing token, repository, or event path).");
    return;
  }
  if (!fs4.existsSync(githubEventPath)) {
    console.warn(`GitHub event file not found at ${githubEventPath}`);
    return;
  }
  let event;
  try {
    event = JSON.parse(fs4.readFileSync(githubEventPath, "utf-8"));
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
  const comments = validAnnotations.map((ann) => ({
    path: ann.file,
    line: ann.line,
    side: "RIGHT",
    body: `### AI Review: ${ann.level === "error" ? "\u274C Error" : ann.level === "warning" ? "\u26A0\uFE0F Warning" : "\u{1F4A1} Suggestion"}

${ann.message}`
  }));
  const url = `https://api.github.com/repos/${githubRepository}/pulls/${prNumber}/reviews`;
  let summaryBody = "### \u{1F916} AI Code Review Summary\n\n";
  if (testPassed) {
    summaryBody += "\u2705 Verification tests passed successfully!\n\n";
  } else {
    summaryBody += "\u274C Verification tests failed. Please check the logs.\n\n";
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
    comments: comments.length > 0 ? comments : void 0
  };
  console.log(`Submitting review to GitHub PR #${prNumber}...`);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `token ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-reviewer-action",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to post review to GitHub: ${response.status} ${response.statusText}
${errorText}`);
  } else {
    console.log("Successfully posted review to GitHub PR.");
  }
}

// src/develop.ts
import fs6 from "fs";
import path5 from "path";
import { execSync as execSync4 } from "child_process";

// src/agent.ts
import fs5 from "fs";
import path4 from "path";
import { execSync as execSync3 } from "child_process";
function listFiles(dir = ".") {
  const results = [];
  if (!fs5.existsSync(dir))
    return [];
  const list = fs5.readdirSync(dir);
  for (const file of list) {
    const fullPath = path4.join(dir, file);
    const stat = fs5.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file === "node_modules" || file === ".git" || file === "dist" || file === "build" || file === "coverage") {
        continue;
      }
      results.push(...listFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}
function resolveSafePath(filePath) {
  const resolved = path4.resolve(process.cwd(), filePath);
  const relative = path4.relative(process.cwd(), resolved);
  if (relative.startsWith("..") || path4.isAbsolute(relative)) {
    throw new Error(`Security Exception: Access denied outside workspace: ${filePath}`);
  }
  return resolved;
}
function executeTool(tool, args) {
  console.log(`\u{1F528} Executing tool [${tool}] with arguments:`, JSON.stringify(args));
  try {
    switch (tool) {
      case "listFiles": {
        const files = listFiles(".");
        return `Workspace files list:
${files.join("\n")}`;
      }
      case "readFile": {
        const targetPath = args.path;
        if (!targetPath)
          return "Error: Missing required argument 'path'.";
        const safePath = resolveSafePath(targetPath);
        if (!fs5.existsSync(safePath))
          return `Error: File not found: ${targetPath}`;
        return fs5.readFileSync(safePath, "utf-8");
      }
      case "writeFile": {
        const targetPath = args.path;
        const content = args.content;
        if (!targetPath || content === void 0) {
          return "Error: Missing required argument 'path' or 'content'.";
        }
        const safePath = resolveSafePath(targetPath);
        fs5.mkdirSync(path4.dirname(safePath), { recursive: true });
        fs5.writeFileSync(safePath, content, "utf-8");
        return `Successfully wrote content to ${targetPath} (${content.length} characters).`;
      }
      case "runCommand": {
        const command = args.command;
        if (!command)
          return "Error: Missing required argument 'command'.";
        if (command.includes("&") || command.includes("|") || command.includes(";")) {
        }
        console.log(`Executing shell command: "${command}"`);
        const output = execSync3(command, {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 6e4
        });
        return `Command finished with output:
${output}`;
      }
      case "finish": {
        return `Task completed: ${args.summary}`;
      }
      default:
        return `Error: Unknown tool: ${tool}`;
    }
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString() : "";
    const stderr = err.stderr ? err.stderr.toString() : "";
    return `Error executing tool: ${err.message}
Stdout:
${stdout}
Stderr:
${stderr}`;
  }
}
function runMockDeveloperAgent(issueTitle, issueBody) {
  console.log(`Starting mock development loop for issue: "${issueTitle}"`);
  const mockActions = [
    {
      thought: "First, I'll list the files in the workspace to locate where the code is.",
      tool: "listFiles",
      arguments: {}
    },
    {
      thought: "I see src/routes/users.ts. Let's read it to find the SQL Injection issue.",
      tool: "readFile",
      arguments: { path: "src/routes/users.ts" }
    },
    {
      thought: "I see the vulnerability. I'll write a fix replacing string interpolation with parameterized queries.",
      tool: "writeFile",
      arguments: {
        path: "src/routes/users.ts",
        content: `import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db/connection.js";
import { logger } from "../logger.js";

const router = Router();

router.get("/users/:id", async (req: Request, res: Response) => {
  // get user by id logic
});

router.get("/users/search", async (req: Request, res: Response) => {
  const { name, email, role } = req.query;

  let query = "SELECT id, name, email, role FROM users WHERE 1=1";
  const params: any[] = [];

  if (name) {
    params.push(\`%\${name}%\`);
    query += \` AND name LIKE $\${params.length}\`;
  }
  if (email) {
    params.push(email);
    query += \` AND email = $\${params.length}\`;
  }
  if (role) {
    params.push(role);
    query += \` AND role = $\${params.length}\`;
  }

  logger.info({ query, params }, "Searching users");

  const result = await db.query(query, params);
  res.json(result.rows);
});
`
      }
    },
    {
      thought: "Now, let's run the project's tests to make sure everything compiles and passes.",
      tool: "runCommand",
      arguments: { command: "npm test" }
    },
    {
      thought: "All tests are compiling and passing! I'm ready to finish.",
      tool: "finish",
      arguments: {
        summary: "Fixed the SQL Injection vulnerability in `src/routes/users.ts` by introducing parameterized query parameters instead of interpolating query strings directly."
      }
    }
  ];
  for (let step = 0; step < mockActions.length; step++) {
    const action = mockActions[step];
    console.log(`
--- Step ${step + 1} / ${mockActions.length} ---`);
    console.log(`\u{1F916} Thought: ${action.thought}`);
    if (action.tool === "listFiles") {
      const out = executeTool("listFiles", {});
      console.log(`Tool Output (truncated): ${out.split("\n").slice(0, 5).join("\n")}...`);
    } else if (action.tool === "runCommand") {
      console.log(`\u{1F528} Executing tool [runCommand] with arguments:`, JSON.stringify(action.arguments));
      console.log("Mock tests execution passed successfully!");
    } else {
      const out = executeTool(action.tool, action.arguments);
      console.log(`Tool Output:`, out);
    }
  }
  return "Fixed the SQL Injection vulnerability in `src/routes/users.ts` by introducing parameterized query parameters instead of interpolating query strings directly.";
}
async function runDeveloperAgent(config, issueTitle, issueBody) {
  if (config.mock) {
    return runMockDeveloperAgent(issueTitle, issueBody);
  }
  const apiKey = config.openrouterApiKey || config.openaiApiKey || config.geminiApiKey;
  if (!apiKey) {
    throw new Error("API key is required for developer agent execution.");
  }
  const conversationHistory = [];
  const systemPrompt = `You are an expert AI software developer running in a local workspace repository.
Your task is to fix a bug or implement a feature described in a GitHub issue.
You can read and modify files in the repository, list workspace directories, and execute shell commands to compile or run tests.

You have access to the following tools:
1. listFiles: {}
   Recursively lists files inside the repository (excludes build, node_modules, .git, etc.).
2. readFile: { "path": "path/to/file.ts" }
   Reads the text content of a file in the workspace.
3. writeFile: { "path": "path/to/file.ts", "content": "..." }
   Creates or overwrites a file with new content.
4. runCommand: { "command": "npm test" }
   Runs a command (like running tests, compiling, or formatting) in the terminal and returns its console output.
5. finish: { "summary": "Detailed explanation of code changes made..." }
   Call this tool once changes are complete, compiling, and all tests pass.

Your output must be a single, raw JSON object matching this schema (with no enclosing markdown blocks):
{
  "thought": "Your step-by-step reasoning explaining why you want to invoke this tool...",
  "tool": "listFiles" | "readFile" | "writeFile" | "runCommand" | "finish",
  "arguments": { ... }
}

Guidelines:
1. Start by listing files to orient yourself in the codebase.
2. Read files before editing them.
3. Keep changes minimal and focused.
4. Always run compilation or tests (e.g. \`npm test\` or \`cargo test\`) after making edits to ensure they didn't break the build or tests.
5. Do not stop until all tests pass. Call 'finish' only when you have verified that the implementation is complete.
`;
  const initialUserMessage = `Please resolve this GitHub issue.
Issue Title: ${issueTitle}
Issue Description:
${issueBody}`;
  conversationHistory.push({ role: "system", content: systemPrompt });
  conversationHistory.push({ role: "user", content: initialUserMessage });
  let url = "";
  let headers = {
    "Content-Type": "application/json"
  };
  if (config.openrouterApiKey) {
    url = "https://openrouter.ai/api/v1/chat/completions";
    headers["Authorization"] = `Bearer ${config.openrouterApiKey}`;
    headers["HTTP-Referer"] = "https://github.com/zakerytclarke/ai-reviewer";
    headers["X-Title"] = "AI Code Reviewer";
  } else if (config.openaiApiKey) {
    url = "https://api.openai.com/v1/chat/completions";
    headers["Authorization"] = `Bearer ${config.openaiApiKey}`;
  } else if (config.geminiApiKey) {
    const modelName = config.model.includes("/") ? config.model.split("/")[1] : config.model;
    url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.geminiApiKey}`;
  }
  console.log(`Starting autonomous agent developer loop (Max steps: ${config.maxSteps})...`);
  for (let step = 1; step <= config.maxSteps; step++) {
    console.log(`
=== Agent Step ${step} / ${config.maxSteps} ===`);
    let rawResponseText = "";
    try {
      if (config.geminiApiKey) {
        const contents = conversationHistory.filter((h) => h.role !== "system").map((h) => ({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content }]
        }));
        const body = {
          contents,
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                thought: { type: "STRING" },
                tool: { type: "STRING", enum: ["listFiles", "readFile", "writeFile", "runCommand", "finish"] },
                arguments: { type: "OBJECT" }
              },
              required: ["thought", "tool", "arguments"]
            }
          }
        };
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini API call failed: ${response.status}
${errorText}`);
        }
        const data = await response.json();
        rawResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else {
        const body = {
          model: config.model,
          messages: conversationHistory,
          response_format: { type: "json_object" }
        };
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LLM API call failed: ${response.status}
${errorText}`);
        }
        const data = await response.json();
        rawResponseText = data.choices?.[0]?.message?.content || "";
      }
    } catch (err) {
      console.error("Error calling LLM:", err.message);
      return `Failed due to LLM error: ${err.message}`;
    }
    if (!rawResponseText) {
      console.error("Received empty response from LLM.");
      return "Failed: Empty response from LLM.";
    }
    let action;
    try {
      let cleaned = rawResponseText.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.substring(7);
      }
      if (cleaned.endsWith("```")) {
        cleaned = cleaned.substring(0, cleaned.length - 3);
      }
      action = JSON.parse(cleaned.trim());
    } catch (err) {
      console.error("Failed to parse LLM action JSON:", rawResponseText);
      conversationHistory.push({
        role: "user",
        content: `Error: Your output was not valid JSON. Please reply with a single JSON object matching the schema. Error was: ${err.message}`
      });
      continue;
    }
    console.log(`\u{1F916} Thought: ${action.thought}`);
    console.log(`Tool call: ${action.tool}`);
    if (action.tool === "finish") {
      const summary = action.arguments.summary || "No summary provided.";
      console.log(`
\u{1F389} Agent finished work! Summary:
${summary}`);
      return summary;
    }
    const toolOutput = executeTool(action.tool, action.arguments);
    console.log(`Tool Output length: ${toolOutput.length}`);
    conversationHistory.push({
      role: "assistant",
      content: rawResponseText
    });
    conversationHistory.push({
      role: "user",
      content: `Tool [${action.tool}] output:
${toolOutput}`
    });
  }
  console.warn("Reached maximum agent steps without finishing.");
  return "Developer agent reached the maximum number of steps without calling 'finish'.";
}

// src/develop.ts
async function developIssue(config) {
  const { issueFile, githubEventPath, githubToken, githubRepository } = config;
  let eventPayload = {};
  if (issueFile) {
    const fullPath = path5.resolve(process.cwd(), issueFile);
    if (!fs6.existsSync(fullPath)) {
      throw new Error(`Issue file not found: ${fullPath}`);
    }
    eventPayload = JSON.parse(fs6.readFileSync(fullPath, "utf-8"));
  } else if (githubEventPath && fs6.existsSync(githubEventPath)) {
    try {
      eventPayload = JSON.parse(fs6.readFileSync(githubEventPath, "utf-8"));
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
  console.log(`
\u{1F4CB} Processing Issue #${issueNumber}: "${issueTitle}"`);
  console.log(`Target base branch: "${defaultBranch}"`);
  const summaryOfChanges = await runDeveloperAgent(config, issueTitle, issueBody);
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
  let gitStatus = "";
  try {
    gitStatus = execSync4("git status --porcelain", { encoding: "utf-8" }).trim();
  } catch (err) {
    console.warn("Warning: Failed to run git status. Assuming no changes.");
  }
  if (!gitStatus) {
    console.log("No files were modified by the developer agent. Exiting without PR.");
    return;
  }
  console.log("\nFiles modified:\n" + gitStatus);
  const patchBranch = `ai-patch/issue-${issueNumber}`;
  console.log(`Creating branch: "${patchBranch}"...`);
  try {
    execSync4('git config user.name "github-actions[bot]"', { stdio: "inherit" });
    execSync4('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"', {
      stdio: "inherit"
    });
    execSync4(`git checkout -b ${patchBranch}`, { stdio: "inherit" });
    execSync4("git add .", { stdio: "inherit" });
    execSync4(`git commit -m "AI: resolve issue #${issueNumber} - ${issueTitle}"`, {
      stdio: "inherit"
    });
    console.log(`Pushing branch "${patchBranch}" to origin...`);
    execSync4(`git push origin ${patchBranch} --force`, { stdio: "inherit" });
  } catch (err) {
    throw new Error(`Git checkout/commit/push failed: ${err.message}`);
  }
  if (!githubToken || !githubRepository) {
    console.log("GITHUB_TOKEN or GITHUB_REPOSITORY is missing. Skipping Pull Request creation.");
    return;
  }
  const prUrl = `https://api.github.com/repos/${githubRepository}/pulls`;
  const prBody = {
    title: `AI: Resolve Issue #${issueNumber} - ${issueTitle}`,
    head: patchBranch,
    base: defaultBranch,
    body: `Closes #${issueNumber}

### \u{1F916} Autonomous Developer Changes Summary

${summaryOfChanges}`
  };
  console.log("Opening GitHub Pull Request...");
  const prResponse = await fetch(prUrl, {
    method: "POST",
    headers: {
      "Authorization": `token ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-reviewer-action",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(prBody)
  });
  if (!prResponse.ok) {
    const errorText = await prResponse.text();
    console.error(`Failed to create Pull Request: ${prResponse.status}
${errorText}`);
    return;
  }
  const prData = await prResponse.json();
  const prHtmlUrl = prData.html_url;
  const prNumber = prData.number;
  console.log(`Successfully created Pull Request #${prNumber}: ${prHtmlUrl}`);
  const commentUrl = `https://api.github.com/repos/${githubRepository}/issues/${issueNumber}/comments`;
  const commentBody = {
    body: `\u{1F916} Beep boop! I have attempted to resolve this issue in Pull Request #${prNumber} (${prHtmlUrl}).`
  };
  console.log(`Adding link comment to Issue #${issueNumber}...`);
  const commentResponse = await fetch(commentUrl, {
    method: "POST",
    headers: {
      "Authorization": `token ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-reviewer-action",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commentBody)
  });
  if (!commentResponse.ok) {
    const errorText = await commentResponse.text();
    console.error(`Failed to post issue comment: ${commentResponse.status}
${errorText}`);
  } else {
    console.log("Successfully posted issue comment.");
  }
}

// src/index.ts
async function runReviewMode(config) {
  let testPassed = true;
  let testOutput = void 0;
  if (config.runTests) {
    const testResult = runTests(config.testCommand);
    if (testResult.run) {
      testPassed = testResult.passed;
      if (!testPassed) {
        testOutput = testResult.output;
        console.warn("\u26A0\uFE0F Warning: Verification tests failed. Test failures will be sent to the AI for analysis.");
      } else {
        console.log("\u2705 Verification tests passed.");
      }
    } else {
      console.log("No tests detected or run.");
    }
  }
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
  const reviewResult = await getReviewFromLLM(config, fileDiffs, testOutput);
  const isGitHubAction = !!process.env.GITHUB_ACTIONS;
  if (isGitHubAction) {
    console.log("Running in GitHub Actions environment.");
    printWorkflowAnnotations(reviewResult.reviews);
    if (config.githubToken) {
      await postGitHubReview(config, fileDiffs, reviewResult.reviews, testPassed);
    } else {
      console.log("GITHUB_TOKEN not provided, skipping inline PR comment posting.");
    }
  } else {
    printConsoleReview(reviewResult.reviews);
  }
}
async function main() {
  try {
    const config = loadConfig(process.argv.slice(2));
    console.log("Initializing AI Reviewer & Developer CLI...");
    let runMode = config.subcommand;
    if (!runMode) {
      if (config.githubEventName === "issues") {
        runMode = "develop";
      } else {
        runMode = "review";
      }
    }
    if (runMode === "develop") {
      console.log("Mode: Autonomous Developer Agent");
      await developIssue(config);
    } else {
      console.log("Mode: Code Review Judge");
      await runReviewMode(config);
    }
    process.exit(0);
  } catch (err) {
    console.error("\u274C Critical Error running AI CLI:");
    console.error(err.message || err);
    process.exit(1);
  }
}
main();
