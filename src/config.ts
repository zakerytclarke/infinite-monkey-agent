import fs from "fs";
import path from "path";

export interface Config {
  openrouterApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  model: string;
  customPrompt?: string;
  githubToken?: string;
  runTests: boolean;
  testCommand?: string;
  diffFile?: string;
  branch: string;
  mock: boolean;
  subcommand?: "review" | "develop";
  issueFile?: string;
  maxSteps: number;
  githubEventPath?: string;
  githubRepository?: string;
  githubRef?: string;
  githubSha?: string;
  githubEventName?: string;
}

export function loadConfig(args: string[]): Config {
  let subcommand: "review" | "develop" | undefined = undefined;
  const remainingArgs = [...args];

  if (remainingArgs.length > 0 && !remainingArgs[0].startsWith("-")) {
    const cmd = remainingArgs[0].toLowerCase();
    if (cmd === "review" || cmd === "develop") {
      subcommand = cmd as "review" | "develop";
      remainingArgs.shift();
    }
  }

  // 1. Default configuration
  const config: Config = {
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
    githubEventName: process.env.GITHUB_EVENT_NAME,
  };

  // 2. Load from configuration file if exists (ai-reviewer.json or .ai-reviewer.json)
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

  // 3. Load from environment variables (GitHub Actions prefix `INPUT_` first, then standard)
  const env = process.env;

  const openrouterKey = env.INPUT_OPENROUTER_API_KEY || env.OPENROUTER_API_KEY;
  if (openrouterKey) config.openrouterApiKey = openrouterKey;

  const openaiKey = env.INPUT_OPENAI_API_KEY || env.OPENAI_API_KEY;
  if (openaiKey) config.openaiApiKey = openaiKey;

  const geminiKey = env.INPUT_GEMINI_API_KEY || env.GEMINI_API_KEY;
  if (geminiKey) config.geminiApiKey = geminiKey;

  const ghToken = env.INPUT_GITHUB_TOKEN || env.GITHUB_TOKEN || env.GH_TOKEN;
  if (ghToken) config.githubToken = ghToken;

  const inputModel = env.INPUT_MODEL || env.AI_REVIEWER_MODEL;
  if (inputModel) config.model = inputModel;

  const inputPrompt = env.INPUT_CUSTOM_PROMPT || env.AI_REVIEWER_PROMPT;
  if (inputPrompt) config.customPrompt = inputPrompt;

  const inputRunTests = env.INPUT_RUN_TESTS || env.AI_REVIEWER_RUN_TESTS;
  if (inputRunTests !== undefined) {
    config.runTests = inputRunTests.toString().toLowerCase() !== "false";
  }

  const inputTestCommand = env.INPUT_TEST_COMMAND || env.AI_REVIEWER_TEST_COMMAND;
  if (inputTestCommand) config.testCommand = inputTestCommand;

  const inputMock = env.INPUT_MOCK || env.AI_REVIEWER_MOCK;
  if (inputMock !== undefined) {
    config.mock = inputMock.toString().toLowerCase() === "true";
  }

  const inputMaxSteps = env.INPUT_MAX_STEPS || env.AI_REVIEWER_MAX_STEPS;
  if (inputMaxSteps) {
    const val = parseInt(inputMaxSteps.toString(), 10);
    if (!isNaN(val)) config.maxSteps = val;
  }

  // 4. Load from CLI arguments
  for (let i = 0; i < remainingArgs.length; i++) {
    const arg = remainingArgs[i];
    if (arg === "--branch" || arg === "-b") {
      const val = remainingArgs[++i];
      if (val) config.branch = val;
    } else if (arg === "--model" || arg === "-m") {
      const val = remainingArgs[++i];
      if (val) config.model = val;
    } else if (arg === "--prompt" || arg === "-p") {
      const val = remainingArgs[++i];
      if (val) {
        // Check if value is a file path, otherwise treat as literal prompt
        if (fs.existsSync(path.resolve(process.cwd(), val))) {
          config.customPrompt = fs.readFileSync(path.resolve(process.cwd(), val), "utf-8");
        } else {
          config.customPrompt = val;
        }
      }
    } else if (arg === "--diff-file" || arg === "-d") {
      const val = remainingArgs[++i];
      if (val) config.diffFile = val;
    } else if (arg === "--issue-file") {
      const val = remainingArgs[++i];
      if (val) config.issueFile = val;
    } else if (arg === "--max-steps") {
      const val = remainingArgs[++i];
      if (val) {
        const parsedSteps = parseInt(val, 10);
        if (!isNaN(parsedSteps)) config.maxSteps = parsedSteps;
      }
    } else if (arg === "--run-tests") {
      config.runTests = true;
    } else if (arg === "--no-tests") {
      config.runTests = false;
    } else if (arg === "--test-command") {
      const val = remainingArgs[++i];
      if (val) config.testCommand = val;
    } else if (arg === "--mock") {
      config.mock = true;
    }
  }

  return config;
}
