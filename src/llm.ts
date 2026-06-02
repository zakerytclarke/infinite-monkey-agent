import { Config } from "./config.js";
import { FileDiff, getFullFileContent } from "./git.js";

export interface ReviewAnnotation {
  file: string;
  line: number;
  level: "notice" | "warning" | "error";
  message: string;
}

export interface ReviewResult {
  reviews: ReviewAnnotation[];
}

function generateMockReview(fileDiffs: FileDiff[], testOutput?: string): ReviewResult {
  const reviews: ReviewAnnotation[] = [];

  for (const fd of fileDiffs) {
    for (const hunk of fd.hunks) {
      for (const line of hunk.lines) {
        if (line.type !== "added" || !line.newLineNumber) continue;

        const content = line.content;

        // 1. SQL Injection vulnerability in users.ts
        if (fd.file.includes("users.ts") && content.includes("LIKE '%${name}%'")) {
          reviews.push({
            file: fd.file,
            line: line.newLineNumber,
            level: "error",
            message: "Critical SQL Injection vulnerability. User input `name` is directly interpolated into the query string. Use parameterized queries instead (e.g. `db.query('... WHERE name LIKE $1', ['%' + name + '%'])`).",
          });
        }
        else if (fd.file.includes("users.ts") && content.includes("email = '${email}'")) {
          reviews.push({
            file: fd.file,
            line: line.newLineNumber,
            level: "error",
            message: "Critical SQL Injection vulnerability. User input `email` is directly interpolated into the query string. Use parameterized queries instead.",
          });
        }
        else if (fd.file.includes("users.ts") && content.includes("role = '${role}'")) {
          reviews.push({
            file: fd.file,
            line: line.newLineNumber,
            level: "error",
            message: "Critical SQL Injection vulnerability. User input `role` is directly interpolated into the query string. Use parameterized queries instead.",
          });
        }

        // 2. Hardcoded API key in payment-gateway.ts
        else if (fd.file.includes("payment-gateway.ts") && content.includes("sk_live_")) {
          reviews.push({
            file: fd.file,
            line: line.newLineNumber,
            level: "error",
            message: "Security issue: Hardcoded Stripe live API key detected. Sensitive credentials should never be committed to source control. Move this to an environment variable or use a secrets manager.",
          });
        }

        // 3. Date comparison timezone dependency in offer-eligibility.ts
        else if (fd.file.includes("offer-eligibility.ts") && content.includes("new Date()")) {
          reviews.push({
            file: fd.file,
            line: line.newLineNumber,
            level: "warning",
            message: "Timezone issue: Comparing `offer.expiryDate` against `new Date()` uses the server's local timezone, which might cause inconsistent eligibility checks depending on where the application is deployed. Consider using UTC dates or an explicit timezone library.",
          });
        }

        // 4. Notification service un-awaited / non-concurred loop fetch
        else if (fd.file.includes("notification-service.ts") && content.includes("await fetch")) {
          reviews.push({
            file: fd.file,
            line: line.newLineNumber,
            level: "warning",
            message: "Performance issue: Sending notifications sequentially using `await fetch` inside a loop will be slow for large lists of users. Consider using `Promise.all` with a concurrency limit (e.g. p-limit) or a background queue to send notifications asynchronously.",
          });
        }

        // 5. Hardcoded confidence threshold in compound-agent.ts
        else if (fd.file.includes("compound-agent.ts") && content.includes("obs.confidence < 0.7")) {
          reviews.push({
            file: fd.file,
            line: line.newLineNumber,
            level: "notice",
            message: "Code smell: Hardcoded confidence threshold value `0.7`. Consider moving this threshold to a config file or environment variable so it can be tuned without changing the code.",
          });
        }
      }
    }
  }

  // If we didn't find any specific bugs to flag, add a general suggestion on any added line of code
  if (reviews.length === 0) {
    for (const fd of fileDiffs) {
      if (fd.isDeleted) continue;
      const firstAdded = fd.hunks[0]?.lines.find(l => l.type === "added" && l.newLineNumber);
      if (firstAdded && firstAdded.newLineNumber) {
        reviews.push({
          file: fd.file,
          line: firstAdded.newLineNumber,
          level: "notice",
          message: "Code change looks solid. Please ensure appropriate unit tests are updated to cover this new logic.",
        });
        break;
      }
    }
  }

  return { reviews };
}

/**
 * Call the AI model to review code changes.
 */
export async function getReviewFromLLM(
  config: Config,
  fileDiffs: FileDiff[],
  testOutput?: string
): Promise<ReviewResult> {
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

  // 1. Build context: files and their new contents
  let filesContext = "";
  for (const fd of fileDiffs) {
    if (fd.isDeleted) continue;
    const content = getFullFileContent(fd.file);
    if (content) {
      // Limit file content size per file to 150KB to keep request size reasonable
      const truncated = content.length > 150000 ? content.slice(0, 150000) + "\n...[TRUNCATED]..." : content;
      filesContext += `\n--- File: ${fd.file} ---\n${truncated}\n`;
    }
  }

  // 2. Build system prompt
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
    systemPrompt += `\nAdditional user guidelines/preferences:\n${config.customPrompt}\n`;
  }

  // 3. Build user prompt
  let userPrompt = `Here is the git diff:
\`\`\`diff
${fileDiffs.map(fd => fd.rawContent).join("\n")}
\`\`\`
`;

  if (filesContext) {
    userPrompt += `\nHere are the full contents of the modified files for surrounding context:\n${filesContext}\n`;
  }

  if (testOutput) {
    userPrompt += `\nIMPORTANT: The project test suite failed during verification with the following logs:
\`\`\`
${testOutput}
\`\`\`
Please analyze if any of the changes in the diff broke the tests. If so, leave a review comment on the problematic line(s) explaining how the change caused the test failure.
`;
  }

  // 4. Send request to the selected API endpoint
  let url = "";
  let headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  let body: any = {};

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
    // If using Gemini API directly
    const modelName = config.model.includes("/") ? config.model.split("/")[1] : config.model;
    url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.geminiApiKey}`;

    body = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
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
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API request failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const resultData = await response.json() as any;

  // 5. Parse response
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
    const jsonResult = JSON.parse(rawResponseText) as ReviewResult;
    if (!jsonResult.reviews || !Array.isArray(jsonResult.reviews)) {
      return { reviews: [] };
    }
    return jsonResult;
  } catch (err: any) {
    console.error("Failed to parse JSON response from LLM:", rawResponseText);
    throw new Error(`Invalid JSON returned from model: ${err.message}`);
  }
}
