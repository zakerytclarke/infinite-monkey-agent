import json
import requests
from ai_reviewer.config import Config
from ai_reviewer.git_utils import FileDiff, get_full_file_content

def generate_mock_review(file_diffs: list[FileDiff], test_output: str = None) -> dict:
    reviews = []
    
    for fd in file_diffs:
        for hunk in fd.hunks:
            for line in hunk.lines:
                if line.type != "added" or not line.new_line_number:
                    continue
                
                content = line.content

                # 1. SQL Injection vulnerability in users.ts
                if "users.ts" in fd.file and "LIKE '%${name}%'" in content:
                    reviews.append({
                        "file": fd.file,
                        "line": line.new_line_number,
                        "level": "error",
                        "message": "Critical SQL Injection vulnerability. User input `name` is directly interpolated into the query string. Use parameterized queries instead (e.g. `db.query('... WHERE name LIKE $1', ['%' + name + '%'])`)."
                    })
                elif "users.ts" in fd.file and "email = '${email}'" in content:
                    reviews.append({
                        "file": fd.file,
                        "line": line.new_line_number,
                        "level": "error",
                        "message": "Critical SQL Injection vulnerability. User input `email` is directly interpolated into the query string. Use parameterized queries instead."
                    })
                elif "users.ts" in fd.file and "role = '${role}'" in content:
                    reviews.append({
                        "file": fd.file,
                        "line": line.new_line_number,
                        "level": "error",
                        "message": "Critical SQL Injection vulnerability. User input `role` is directly interpolated into the query string. Use parameterized queries instead."
                    })

                # 2. Hardcoded API key in payment-gateway.ts
                elif "payment-gateway.ts" in fd.file and "sk_live_" in content:
                    reviews.append({
                        "file": fd.file,
                        "line": line.new_line_number,
                        "level": "error",
                        "message": "Security issue: Hardcoded Stripe live API key detected. Sensitive credentials should never be committed to source control. Move this to an environment variable or use a secrets manager."
                    })

                # 3. Date comparison timezone dependency in offer-eligibility.ts
                elif "offer-eligibility.ts" in fd.file and "new Date()" in content:
                    reviews.append({
                        "file": fd.file,
                        "line": line.new_line_number,
                        "level": "warning",
                        "message": "Timezone issue: Comparing `offer.expiryDate` against `new Date()` uses the server's local timezone, which might cause inconsistent eligibility checks depending on where the application is deployed. Consider using UTC dates or an explicit timezone library."
                    })

                # 4. Notification service un-awaited / non-concurred loop fetch
                elif "notification-service.ts" in fd.file and "await fetch" in content:
                    reviews.append({
                        "file": fd.file,
                        "line": line.new_line_number,
                        "level": "warning",
                        "message": "Performance issue: Sending notifications sequentially using `await fetch` inside a loop will be slow for large lists of users. Consider using `Promise.all` with a concurrency limit (e.g. p-limit) or a background queue to send notifications asynchronously."
                    })

                # 5. Hardcoded confidence threshold in compound-agent.ts
                elif "compound-agent.ts" in fd.file and "obs.confidence < 0.7" in content:
                    reviews.append({
                        "file": fd.file,
                        "line": line.new_line_number,
                        "level": "notice",
                        "message": "Code smell: Hardcoded confidence threshold value `0.7`. Consider moving this threshold to a config file or environment variable so it can be tuned without changing the code."
                    })

    if not reviews:
        for fd in file_diffs:
            if fd.is_deleted:
                continue
            first_added = next((l for l in fd.hunks[0].lines if l.type == "added" and l.new_line_number), None) if fd.hunks else None
            if first_added and first_added.new_line_number:
                reviews.append({
                    "file": fd.file,
                    "line": first_added.new_line_number,
                    "level": "notice",
                    "message": "Code change looks solid. Please ensure appropriate unit tests are updated to cover this new logic."
                })
                break

    return {"reviews": reviews}

def get_review_from_llm(config: Config, file_diffs: list[FileDiff], test_output: str = None) -> dict:
    if config.mock:
        print("Using mock code reviewer reviews...")
        return generate_mock_review(file_diffs, test_output)

    api_key = config.openrouter_api_key or config.openai_api_key or config.gemini_api_key
    if not api_key:
        raise ValueError("No API key provided. Please set OPENROUTER_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.")

    # 1. Build context
    files_context = ""
    for fd in file_diffs:
        if fd.is_deleted:
            continue
        content = get_full_file_content(fd.file)
        if content:
            # Limit file contents to 150KB
            truncated = content if len(content) <= 150000 else content[:150000] + "\n...[TRUNCATED]..."
            files_context += f"\n--- File: {fd.file} ---\n{truncated}\n"

    # 2. Build system prompt
    system_prompt = """You are an expert software engineer and code reviewer.
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
"""

    if config.custom_prompt:
        system_prompt += f"\nAdditional user guidelines/preferences:\n{config.custom_prompt}\n"

    # 3. Build user prompt
    user_prompt = f"Here is the git diff:\n```diff\n"
    user_prompt += "\n".join([fd.raw_content for fd in file_diffs])
    user_prompt += "\n```\n"

    if files_context:
        user_prompt += f"\nHere are the full contents of the modified files for surrounding context:\n{files_context}\n"

    if test_output:
        user_prompt += f"\nIMPORTANT: The project test suite failed during verification with the following logs:\n```\n{test_output}\n```\n"
        user_prompt += "Please analyze if any of the changes in the diff broke the tests. If so, leave a review comment on the problematic line(s) explaining how the change caused the test failure.\n"

    # 4. Invoke API using requests
    headers = {"Content-Type": "application/json"}
    body = {}
    url = ""

    if config.openrouter_api_key:
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers["Authorization"] = f"Bearer {config.openrouter_api_key}"
        headers["HTTP-Referer"] = "https://github.com/zakerytclarke/ai-reviewer"
        headers["X-Title"] = "AI Code Reviewer"
        body = {
            "model": config.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "response_format": {"type": "json_object"}
        }
    elif config.openai_api_key:
        url = "https://api.openai.com/v1/chat/completions"
        headers["Authorization"] = f"Bearer {config.openai_api_key}"
        body = {
            "model": config.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "response_format": {"type": "json_object"}
        }
    elif config.gemini_api_key:
        model_name = config.model.split("/")[-1] if "/" in config.model else config.model
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={config.gemini_api_key}"
        body = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": {
                    "type": "OBJECT",
                    "properties": {
                        "reviews": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "file": {"type": "STRING"},
                                    "line": {"type": "INTEGER"},
                                    "level": {"type": "STRING", "enum": ["notice", "warning", "error"]},
                                    "message": {"type": "STRING"}
                                },
                                "required": ["file", "line", "level", "message"]
                            }
                        }
                    },
                    "required": ["reviews"]
                }
            }
        }

    print(f"Sending diff to AI model ({config.model})...")
    res = requests.post(url, headers=headers, json=body, timeout=60)
    
    if res.status_code != 200:
        raise RuntimeError(f"LLM API request failed: {res.status_code} {res.reason}\n{res.text}")

    data = res.json()
    raw_response_text = ""

    if config.openrouter_api_key or config.openai_api_key:
        raw_response_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    elif config.gemini_api_key:
        raw_response_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")

    if not raw_response_text:
        raise RuntimeError("Received empty response from the AI model.")

    try:
        # Strip markdown if model output contains it
        cleaned = raw_response_text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        
        parsed = json.loads(cleaned.strip())
        if not isinstance(parsed, dict) or "reviews" not in parsed:
            return {"reviews": []}
        return parsed
    except Exception as e:
        print("Failed to parse JSON response from LLM:", raw_response_text)
        raise RuntimeError(f"Invalid JSON returned from model: {e}")
