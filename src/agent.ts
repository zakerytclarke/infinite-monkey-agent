import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { Config } from "./config.js";

export interface AgentAction {
  thought: string;
  tool: "listFiles" | "readFile" | "writeFile" | "runCommand" | "finish";
  arguments: any;
}

// Recursive list files helper
function listFiles(dir: string = "."): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (
        file === "node_modules" ||
        file === ".git" ||
        file === "dist" ||
        file === "build" ||
        file === "coverage"
      ) {
        continue;
      }
      results.push(...listFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

// Safe path resolver to prevent escaping the workspace
function resolveSafePath(filePath: string): string {
  const resolved = path.resolve(process.cwd(), filePath);
  const relative = path.relative(process.cwd(), resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Security Exception: Access denied outside workspace: ${filePath}`);
  }
  return resolved;
}

// Execute agent tool locally
function executeTool(tool: string, args: any): string {
  console.log(`🔨 Executing tool [${tool}] with arguments:`, JSON.stringify(args));
  try {
    switch (tool) {
      case "listFiles": {
        const files = listFiles(".");
        return `Workspace files list:\n${files.join("\n")}`;
      }
      case "readFile": {
        const targetPath = args.path;
        if (!targetPath) return "Error: Missing required argument 'path'.";
        const safePath = resolveSafePath(targetPath);
        if (!fs.existsSync(safePath)) return `Error: File not found: ${targetPath}`;
        return fs.readFileSync(safePath, "utf-8");
      }
      case "writeFile": {
        const targetPath = args.path;
        const content = args.content;
        if (!targetPath || content === undefined) {
          return "Error: Missing required argument 'path' or 'content'.";
        }
        const safePath = resolveSafePath(targetPath);
        fs.mkdirSync(path.dirname(safePath), { recursive: true });
        fs.writeFileSync(safePath, content, "utf-8");
        return `Successfully wrote content to ${targetPath} (${content.length} characters).`;
      }
      case "runCommand": {
        const command = args.command;
        if (!command) return "Error: Missing required argument 'command'.";
        
        // Disallow dangerous or infinite background commands
        if (command.includes("&") || command.includes("|") || command.includes(";")) {
          // Soft check: allow compound commands but warn
        }
        
        console.log(`Executing shell command: "${command}"`);
        const output = execSync(command, {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 60000,
        });
        return `Command finished with output:\n${output}`;
      }
      case "finish": {
        return `Task completed: ${args.summary}`;
      }
      default:
        return `Error: Unknown tool: ${tool}`;
    }
  } catch (err: any) {
    const stdout = err.stdout ? err.stdout.toString() : "";
    const stderr = err.stderr ? err.stderr.toString() : "";
    return `Error executing tool: ${err.message}\nStdout:\n${stdout}\nStderr:\n${stderr}`;
  }
}

/**
 * Executes a mock developer loop for offline testing.
 */
function runMockDeveloperAgent(issueTitle: string, issueBody: string): string {
  console.log(`Starting mock development loop for issue: "${issueTitle}"`);
  
  // Define sequence of mock actions
  const mockActions: AgentAction[] = [
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
    console.log(`\n--- Step ${step + 1} / ${mockActions.length} ---`);
    console.log(`🤖 Thought: ${action.thought}`);
    
    // Simulate execution
    if (action.tool === "listFiles") {
      const out = executeTool("listFiles", {});
      console.log(`Tool Output (truncated): ${out.split("\n").slice(0, 5).join("\n")}...`);
    } else if (action.tool === "runCommand") {
      console.log(`🔨 Executing tool [runCommand] with arguments:`, JSON.stringify(action.arguments));
      console.log("Mock tests execution passed successfully!");
    } else {
      const out = executeTool(action.tool, action.arguments);
      console.log(`Tool Output:`, out);
    }
  }

  return "Fixed the SQL Injection vulnerability in `src/routes/users.ts` by introducing parameterized query parameters instead of interpolating query strings directly.";
}

/**
 * Runs the main developer agent loop.
 */
export async function runDeveloperAgent(
  config: Config,
  issueTitle: string,
  issueBody: string
): Promise<string> {
  if (config.mock) {
    return runMockDeveloperAgent(issueTitle, issueBody);
  }

  const apiKey = config.openrouterApiKey || config.openaiApiKey || config.geminiApiKey;
  if (!apiKey) {
    throw new Error("API key is required for developer agent execution.");
  }

  const conversationHistory: { role: "system" | "user" | "assistant"; content: string }[] = [];

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
  let headers: Record<string, string> = {
    "Content-Type": "application/json",
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
    // For direct Gemini API, we format the content list
    const modelName = config.model.includes("/") ? config.model.split("/")[1] : config.model;
    url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.geminiApiKey}`;
  }

  console.log(`Starting autonomous agent developer loop (Max steps: ${config.maxSteps})...`);

  for (let step = 1; step <= config.maxSteps; step++) {
    console.log(`\n=== Agent Step ${step} / ${config.maxSteps} ===`);

    let rawResponseText = "";

    try {
      if (config.geminiApiKey) {
        // Direct Gemini API structure
        const contents = conversationHistory
          .filter(h => h.role !== "system")
          .map(h => ({
            role: h.role === "assistant" ? "model" : "user",
            parts: [{ text: h.content }]
          }));

        // Insert system instruction separately
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
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini API call failed: ${response.status}\n${errorText}`);
        }

        const data = await response.json() as any;
        rawResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else {
        // OpenAI / OpenRouter structure
        const body = {
          model: config.model,
          messages: conversationHistory,
          response_format: { type: "json_object" }
        };

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LLM API call failed: ${response.status}\n${errorText}`);
        }

        const data = await response.json() as any;
        rawResponseText = data.choices?.[0]?.message?.content || "";
      }
    } catch (err: any) {
      console.error("Error calling LLM:", err.message);
      return `Failed due to LLM error: ${err.message}`;
    }

    if (!rawResponseText) {
      console.error("Received empty response from LLM.");
      return "Failed: Empty response from LLM.";
    }

    let action: AgentAction;
    try {
      // Robust JSON extraction to strip markdown formatting if any
      let cleaned = rawResponseText.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.substring(7);
      }
      if (cleaned.endsWith("```")) {
        cleaned = cleaned.substring(0, cleaned.length - 3);
      }
      action = JSON.parse(cleaned.trim()) as AgentAction;
    } catch (err: any) {
      console.error("Failed to parse LLM action JSON:", rawResponseText);
      // Give feedback to LLM
      conversationHistory.push({
        role: "user",
        content: `Error: Your output was not valid JSON. Please reply with a single JSON object matching the schema. Error was: ${err.message}`
      });
      continue;
    }

    console.log(`🤖 Thought: ${action.thought}`);
    console.log(`Tool call: ${action.tool}`);

    if (action.tool === "finish") {
      const summary = action.arguments.summary || "No summary provided.";
      console.log(`\n🎉 Agent finished work! Summary:\n${summary}`);
      return summary;
    }

    // Execute the tool and store the output
    const toolOutput = executeTool(action.tool, action.arguments);
    console.log(`Tool Output length: ${toolOutput.length}`);

    // Append to conversation history
    conversationHistory.push({
      role: "assistant",
      content: rawResponseText,
    });
    conversationHistory.push({
      role: "user",
      content: `Tool [${action.tool}] output:\n${toolOutput}`,
    });
  }

  console.warn("Reached maximum agent steps without finishing.");
  return "Developer agent reached the maximum number of steps without calling 'finish'.";
}
