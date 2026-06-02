import os
import json
import subprocess
import requests
from infinite_monkey_agent.config import Config

# Recursive list files helper
def list_files(dir_path: str = ".") -> list[str]:
    results = []
    if not os.path.exists(dir_path):
        return []
    for root, dirs, files in os.walk(dir_path):
        # Ignore common directories
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", "dist", "build", "coverage", "__pycache__", ".pytest_cache", ".venv", "venv")]
        for file in files:
            results.append(os.path.join(root, file))
    return results

# Safe path resolver to prevent directory traversal
def resolve_safe_path(file_path: str) -> str:
    resolved = os.path.abspath(file_path)
    relative = os.path.relpath(resolved, os.getcwd())
    if relative.startswith("..") or os.path.isabs(relative):
        raise PermissionError(f"Security Exception: Access denied outside workspace: {file_path}")
    return resolved

# Execute tool locally
def execute_tool(tool: str, args: dict) -> str:
    print(f"🔨 Executing tool [{tool}] with arguments: {json.dumps(args)}")
    try:
        if tool == "listFiles":
            files = list_files(".")
            return f"Workspace files list:\n" + "\n".join(files)
            
        elif tool == "readFile":
            target_path = args.get("path")
            if not target_path:
                return "Error: Missing required argument 'path'."
            safe_path = resolve_safe_path(target_path)
            if not os.path.exists(safe_path):
                return f"Error: File not found: {target_path}"
            with open(safe_path, "r", encoding="utf-8") as f:
                return f.read()
                
        elif tool == "writeFile":
            target_path = args.get("path")
            content = args.get("content")
            if not target_path or content is None:
                return "Error: Missing required argument 'path' or 'content'."
            safe_path = resolve_safe_path(target_path)
            os.makedirs(os.path.dirname(safe_path), exist_ok=True)
            with open(safe_path, "w", encoding="utf-8") as f:
                f.write(content)
            return f"Successfully wrote content to {target_path} ({len(content)} characters)."
            
        elif tool == "runCommand":
            command = args.get("command")
            if not command:
                return "Error: Missing required argument 'command'."
            print(f"Executing shell command: \"{command}\"")
            res = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=60
            )
            output = f"{res.stdout}\n{res.stderr}".strip()
            return f"Command finished with return code {res.returncode}. Output:\n{output}"
            
        elif tool == "deleteFile":
            target_path = args.get("path")
            if not target_path:
                return "Error: Missing required argument 'path'."
            safe_path = resolve_safe_path(target_path)
            if not os.path.exists(safe_path):
                return f"Error: File not found: {target_path}"
            if os.path.isdir(safe_path):
                import shutil
                shutil.rmtree(safe_path)
                return f"Successfully deleted directory {target_path} and all its contents."
            else:
                os.remove(safe_path)
                return f"Successfully deleted file {target_path}."

        elif tool == "finish":
            return f"Task completed: {args.get('summary', '')}"
            
        else:
            return f"Error: Unknown tool: {tool}"
            
    except Exception as e:
        return f"Error executing tool: {e}"

def run_mock_developer_agent(issue_title: str, issue_body: str) -> str:
    print(f"Starting mock development loop for issue: \"{issue_title}\"")
    
    mock_actions = [
        {
            "thought": "First, I'll list the files in the workspace to locate where the code is.",
            "tool": "listFiles",
            "arguments": {}
        },
        {
            "thought": "I see src/routes/users.ts. Let's read it to find the SQL Injection issue.",
            "tool": "readFile",
            "arguments": {"path": "src/routes/users.ts"}
        },
        {
            "thought": "I see the vulnerability. I'll write a fix replacing string interpolation with parameterized queries.",
            "tool": "writeFile",
            "arguments": {
                "path": "src/routes/users.ts",
                "content": """import { Router } from "express";
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
    params.push(`%${name}%`);
    query += ` AND name LIKE $${params.length}`;
  }
  if (email) {
    params.push(email);
    query += ` AND email = $${params.length}`;
  }
  if (role) {
    params.push(role);
    query += ` AND role = $${params.length}`;
  }

  logger.info({ query, params }, "Searching users");

  const result = await db.query(query, params);
  res.json(result.rows);
});
"""
            }
        },
        {
            "thought": "Now, let's run the project's tests to make sure everything compiles and passes.",
            "tool": "runCommand",
            "arguments": {"command": "npm test"}
        },
        {
            "thought": "All tests are compiling and passing! I'm ready to finish.",
            "tool": "finish",
            "arguments": {
                "summary": "Fixed the SQL Injection vulnerability in `src/routes/users.ts` by introducing parameterized query parameters instead of interpolating query strings directly."
            }
        }
    ]

    for step, action in enumerate(mock_actions):
        print(f"\n--- Step {step + 1} / {len(mock_actions)} ---")
        print(f"🤖 Thought: {action['thought']}")
        
        if action["tool"] == "listFiles":
            out = execute_tool("listFiles", {})
            print(f"Tool Output (truncated):\n" + "\n".join(out.splitlines()[:5]) + "...")
        elif action["tool"] == "runCommand":
            print(f"🔨 Executing tool [runCommand] with arguments: {json.dumps(action['arguments'])}")
            print("Mock tests execution passed successfully!")
        else:
            out = execute_tool(action["tool"], action["arguments"])
            print(f"Tool Output:\n{out}")

    return "Fixed the SQL Injection vulnerability in `src/routes/users.ts` by introducing parameterized query parameters instead of interpolating query strings directly."

async def run_developer_agent(config: Config, issue_title: str, issue_body: str) -> str:
    if config.mock:
        return run_mock_developer_agent(issue_title, issue_body)

    api_key = config.openrouter_api_key or config.openai_api_key or config.gemini_api_key
    if not api_key:
        raise ValueError("API key is required for developer agent execution.")

    conversation_history = []

    system_prompt = """You are an expert AI software developer running in a local workspace repository.
Your task is to fix a bug or implement a feature described in a GitHub issue.
You can read and modify files in the repository, list workspace directories, and execute shell commands to compile or run tests.

You have access to the following tools:
1. listFiles: {}
   Recursively lists files inside the repository (excludes build, node_modules, .git, etc.).
2. readFile: { "path": "path/to/file.ts" }
   Reads the text content of a file in the workspace.
3. writeFile: { "path": "path/to/file.ts", "content": "..." }
   Creates or overwrites a file with new content.
4. deleteFile: { "path": "path/to/file.ts" }
   Deletes a file or directory in the workspace.
5. runCommand: { "command": "npm test" }
   Runs a command (like running tests, compiling, or formatting) in the terminal and returns its console output.
6. finish: { "summary": "Detailed explanation of code changes made..." }
   Call this tool once changes are complete, compiling, and all tests pass.

Your output must be a single, raw JSON object matching this schema (with no enclosing markdown blocks):
{
  "thought": "Your step-by-step reasoning explaining why you want to invoke this tool...",
  "tool": "listFiles" | "readFile" | "writeFile" | "deleteFile" | "runCommand" | "finish",
  "arguments": { ... }
}

Guidelines:
1. Start by listing files to orient yourself in the codebase.
2. Read files before editing them.
3. Keep changes minimal and focused.
4. Always run compilation or tests (e.g. `npm test` or `cargo test`) after making edits to ensure they didn't break the build or tests.
5. Do not stop until all tests pass. Call 'finish' only when you have verified that the implementation is complete.
"""

    initial_user_message = f"Please resolve this GitHub issue.\nIssue Title: {issue_title}\nIssue Description:\n{issue_body}"

    conversation_history.append({"role": "system", "content": system_prompt})
    conversation_history.append({"role": "user", "content": initial_user_message})

    headers = {"Content-Type": "application/json"}
    url = ""

    if config.openrouter_api_key:
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers["Authorization"] = f"Bearer {config.openrouter_api_key}"
        headers["HTTP-Referer"] = "https://github.com/zakerytclarke/infinite-monkey-agent"
        headers["X-Title"] = "Infinite Monkey Agent"
    elif config.openai_api_key:
        url = "https://api.openai.com/v1/chat/completions"
        headers["Authorization"] = f"Bearer {config.openai_api_key}"

    print(f"Starting autonomous agent developer loop (Max steps: {config.max_steps})...")

    for step in range(1, config.max_steps + 1):
        print(f"\n=== Agent Step {step} / {config.max_steps} ===")

        raw_response_text = ""
        try:
            if config.gemini_api_key:
                # Direct Gemini API call
                model_name = config.model.split("/")[-1] if "/" in config.model else config.model
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={config.gemini_api_key}"
                
                contents = []
                for h in conversation_history:
                    if h["role"] == "system":
                        continue
                    role = "model" if h["role"] == "assistant" else "user"
                    contents.append({
                        "role": role,
                        "parts": [{"text": h["content"]}]
                    })
                
                body = {
                    "contents": contents,
                    "systemInstruction": {
                        "parts": [{"text": system_prompt}]
                    },
                    "generationConfig": {
                        "responseMimeType": "application/json",
                        "responseSchema": {
                            "type": "OBJECT",
                            "properties": {
                                "thought": {"type": "STRING"},
                                "tool": {"type": "STRING", "enum": ["listFiles", "readFile", "writeFile", "deleteFile", "runCommand", "finish"]},
                                "arguments": {"type": "OBJECT"}
                            },
                            "required": ["thought", "tool", "arguments"]
                        }
                    }
                }
                res = requests.post(url, headers=headers, json=body, timeout=60)
                if res.status_code != 200:
                    raise RuntimeError(f"Gemini API call failed: {res.status_code} {res.reason}\n{res.text}")
                data = res.json()
                raw_response_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            else:
                # OpenAI / OpenRouter Call
                body = {
                    "model": config.model,
                    "messages": conversation_history,
                    "response_format": {"type": "json_object"}
                }
                res = requests.post(url, headers=headers, json=body, timeout=60)
                if res.status_code != 200:
                    raise RuntimeError(f"LLM API call failed: {res.status_code} {res.reason}\n{res.text}")
                data = res.json()
                raw_response_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")

        except Exception as e:
            print("Error calling LLM:", e)
            return f"Failed due to LLM error: {e}"

        if not raw_response_text:
            print("Received empty response from LLM.")
            return "Failed: Empty response from LLM."

        try:
            # Robust JSON extraction
            cleaned = raw_response_text.strip()
            first_brace = cleaned.find("{")
            last_brace = cleaned.rfind("}")
            if first_brace == -1 or last_brace == -1 or last_brace < first_brace:
                raise ValueError("No JSON object found in LLM response.")
            json_str = cleaned[first_brace:last_brace + 1]
            action = json.loads(json_str)
        except Exception as e:
            print("Failed to parse LLM action JSON:", raw_response_text)
            conversation_history.append({
                "role": "assistant",
                "content": raw_response_text
            })
            conversation_history.append({
                "role": "user",
                "content": f"Error: Your output was not valid JSON. Please reply with a single JSON object matching the schema. Error: {e}"
            })
            continue

        print(f"🤖 Thought: {action.get('thought', '')}")
        tool = action.get("tool", "")
        args = action.get("arguments", {})
        print(f"Tool call: {tool}")

        if tool == "finish":
            summary = args.get("summary", "No summary provided.")
            print(f"\n🎉 Agent finished work! Summary:\n{summary}")
            return summary

        # Execute tool
        tool_output = execute_tool(tool, args)
        print(f"Tool Output length: {len(tool_output)}")

        # Append to history
        conversation_history.append({
            "role": "assistant",
            "content": raw_response_text
        })
        conversation_history.append({
            "role": "user",
            "content": f"Tool [{tool}] output:\n{tool_output}"
        })

    print("Reached maximum agent steps without finishing.")
    return "Developer agent reached the maximum number of steps without calling 'finish'."
