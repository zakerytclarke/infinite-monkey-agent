# 🐒 Infinite Monkey Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PyPI version](https://img.shields.io/pypi/v/infinite-monkey-agent.svg)](https://pypi.org/project/infinite-monkey-agent/)
[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-Verified-blue.svg)](action.yml)
[![Python](https://img.shields.io/badge/Python-%3E%3D3.8-green.svg)](https://python.org)

An intelligent, lightweight, zero-dependency Python package and GitHub Action that serves a dual role:
1. **AI Code Review Judge**: Evaluates Pull Request diffs, runs test suites, and leaves inline review comments or workflow annotations.
2. **Autonomous Developer Agent**: Listens for created issues, executes a tool-calling development loop (reads files, writes fixes, runs tests), pushes code to a branch, opens a Pull Request, and links it back to the issue.

---

## 📦 Installation

To install the CLI tool globally or in your local python environment:

bash
pip install infinite-monkey-agent


To run it locally in development mode from the cloned source directory:

bash
# In the repository root
pip install .


---

## 🤖 Agent Roles & Workflows

Infinite Monkey Agent operates in two main modes: a code review judge and an autonomous software developer.

### 🔍 1. AI Code Review Judge (`review` mode)

In `review` mode, the agent acts as an automated reviewer on pull requests. Its workflow proceeds as follows:

1. **Retrieves Git Diff**: The agent retrieves modifications either from a local git diff relative to the target branch (default: `main`) or fetches the diff directly from the GitHub API using a pull request number (`--pr-number`).
2. **Runs Project Tests**: If enabled (via configuration or `--run-tests`), the agent automatically detects the project type and runs the verification test suite prior to the LLM call. If the tests fail, the output logs are gathered to help the AI model understand the context of the breakage.
3. **Injects Custom Guidelines**: In addition to standard security, logic, and style guidelines, the agent reads and appends guidelines from `infinitemonkey.md` and `claude.md` if they exist in the root of the repository, enabling project-specific standards.
4. **Agent Tool Loop**: The model is prompted with the code review guidelines, the diff (with exact line numbers), and test outputs. It enters a tool-calling loop where it can query files in the workspace.
5. **Applies Annotations**: The agent leaves inline comments on modified lines of the PR via the `leaveComment` tool.
6. **Publishes Results**:
   - **Locally**: Prints colorized logs of errors, warnings, and suggestions to the console.
   - **GitHub Actions**: Publishes GitHub Actions workflow annotations and posts a full PR Review containing the inline comments along with the agent's chain-of-thought summary.

### 💻 2. Autonomous Developer Agent (`develop` mode)

In `develop` mode, the agent acts as an autonomous engineer tasked with resolving a bug or implementing a feature. Its workflow proceeds as follows:

1. **Loads Issue Details**: The agent loads a GitHub Issue title and body from the event payload or a local file (`--issue-file`).
2. **Conversation Context**: If authenticated via GitHub, the agent fetches comments on the issue to gain additional conversational context.
3. **Execution Loop**: The agent starts a multi-step tool-calling cycle (up to `max_steps`, default `30`). In each step, the model reasons and executes tools (reading/writing files, deleting files, running terminal commands) locally to resolve the issue.
4. **Installs Dependencies & Runs Tests**: The agent is responsible for identifying build systems and package managers. If a command fails due to missing dependencies, it runs setup/installation commands (`npm install`, `pip install`, etc.) and runs the test suite iteratively until the codebase compiles and all tests pass.
5. **Calls Finish**: Once verified, the agent concludes by calling the `finish` tool.
6. **Pushes Branch & PR**:
   - Creates a patch branch: `ai-patch/issue-{issue_number}`.
   - Commits changes using a standardized commit message: `AI: resolve issue #{issue_number} - {issue_title}`.
   - Force-pushes the branch to the origin repository.
   - Creates a Pull Request on GitHub targeting the default repository branch, displaying the changes and the verbatim chain-of-thought log.
   - Leaves a comment on the original issue linking to the newly opened PR.

---

## 🛠️ Tool Calling Capabilities

The agent operates in a closed execution loop using structured JSON outputs. During execution, it has access to the following tools:

| Tool | Arguments | Description |
|---|---|---|
| `listFiles` | `{}` | Recursively lists all files in the repository. Ignores common build/dependency folders (e.g. `node_modules`, `.git`, `dist`, `__pycache__`). |
| `readFile` | `{"path": "string"}` | Reads the text content of a file in the workspace. |
| `writeFile` | `{"path": "string", "content": "string"}` | Creates or overwrites a file in the workspace with the specified content. |
| `deleteFile` | `{"path": "string"}` | Deletes a file or recursively deletes a directory. |
| `runCommand` | `{"command": "string"}` | Runs a command in the local workspace shell and returns the output (stdout + stderr). Useful for running tests, compilers, or installing dependencies. |
| `leaveComment` | `{"path": "string", "line": int, "level": "notice"\|"warning"\|"error", "message": "string"}` | *(Reviewer only)* Leaves a code review comment on a specific line of a file. |
| `finish` | `{"summary": "string"}` | Ends the agent execution loop and provides a summary of the accomplishments. |

---

## ⚙️ Configuration & Environment Settings

The tool can be customized through environment variables, GitHub Actions inputs, CLI options, or a project configuration file.

### 1. Configuration File
You can create an `ai-reviewer.json` or `.ai-reviewer.json` file in the root of your project. Keys can be defined in camelCase (e.g., `maxSteps`), which automatically map to snake_case properties inside the agent.

Example `ai-reviewer.json`:
```json
{
  "model": "google/gemini-2.5-pro",
  "maxSteps": 20,
  "runTests": true,
  "testCommand": "pytest tests/"
}
```

### 2. Available Options & Parameters

| Config Parameter | CLI Flag | Environment Variable | GitHub Action Input | Default Value | Description |
|---|---|---|---|---|---|
| **Subcommand** | `review` / `develop` | `AI_REVIEWER_SUBCOMMAND` | `subcommand` | `review` | The mode to run (`review` or `develop`). |
| **OpenRouter Key** | - | `OPENROUTER_API_KEY` | `openrouter_api_key` | `None` | API key to use OpenRouter. |
| **OpenAI Key** | - | `OPENAI_API_KEY` | `openai_api_key` | `None` | API key to use OpenAI. |
| **Gemini Key** | - | `GEMINI_API_KEY` | `gemini_api_key` | `None` | API key to use Google Gemini. |
| **GitHub Token** | - | `GITHUB_TOKEN`, `GH_TOKEN` | `github_token` | `None` | Token to authenticate Git pushes and PR reviews. |
| **Model** | `--model`, `-m` | `AI_REVIEWER_MODEL` | `model` | `gpt-5.4` | LLM model identifier. (Falls back to `gemini-2.5-pro` if only Gemini key is present). |
| **Custom Prompt** | `--prompt`, `-p` | `AI_REVIEWER_PROMPT` | `custom_prompt` | `None` | Custom system instructions or path to instructions file. |
| **Run Tests** | `--run-tests` / `--no-tests` | `AI_REVIEWER_RUN_TESTS` | `run_tests` | `true` | Toggle test execution prior to or during execution. |
| **Test Command** | `--test-command` | `AI_REVIEWER_TEST_COMMAND` | `test_command` | Auto-detected | Specific command used to run tests. |
| **Max Steps** | `--max-steps` | `AI_REVIEWER_MAX_STEPS` | `max_steps` | `30` | Step limit for the developer agent loop. |
| **Base Branch** | `--branch`, `-b` | `GITHUB_BASE_REF` | - | `main` | Target branch to diff/merge against. |
| **Mock Mode** | `--mock` | `AI_REVIEWER_MOCK` | `mock` | `false` | Run with static simulated responses for offline testing. |
| **Diff File** | `--diff-file`, `-d` | - | - | - | Path to a pre-saved `.diff` file for offline reviewing. |
| **Issue File** | `--issue-file` | - | - | - | Path to a GitHub Issue event payload JSON for local development. |
| **PR Number** | `--pr-number` | `PR_NUMBER` | `pr_number` | `None` | Specific pull request number to fetch. |

### 3. Custom Coding Guidelines
If `infinitemonkey.md` or `claude.md` exist in the root of the workspace, their contents are automatically appended to the reviewer agent's system prompt as custom guidelines. This allows repositories to easily enforce coding standards without modifying command-line options.

---

## 🛠️ CLI Subcommands & Local Usage

Once installed, the CLI tool can be executed using the `infinite-monkey-agent` command:

### 1. PR Code Review Mode (`review`)
Runs a git diff against a branch and reviews code modifications.

bash
# Review changes compared to main branch
infinite-monkey-agent review --branch main

# Run review offline on a saved .diff file (mock LLM mode)
infinite-monkey-agent review --diff-file ./path/to/my.diff --mock


### 2. Autonomous Developer Mode (`develop`)
Solves an issue in a workspace loop until code compiles and tests pass.

bash
# Run developer agent locally using a mock issue payload
infinite-monkey-agent develop --issue-file ./issue_payload.json --mock


---

## 🚀 FastAPI CRUD API

This repository now also includes a simple FastAPI CRUD application for managing posts.

### Features

- Create a post
- Retrieve all posts
- Retrieve a single post by ID
- Update a post
- Delete a post
- SQLite persistence
- Automatic request/response validation with Pydantic
- Search by title or content
- Pagination with `skip` and `limit`
- Sorting by newest first on the list endpoint

### Post Schema

Each post contains:

- `id`
- `title`
- `content`
- `created_at`
- `updated_at`

### Run Locally

Install dependencies:

bash
pip install .


Start the API server:

bash
uvicorn infinite_monkey_agent.api:app --reload


The API will be available at:

- `http://127.0.0.1:8000`
- Interactive docs: `http://127.0.0.1:8000/docs`
- OpenAPI schema: `http://127.0.0.1:8000/openapi.json`

### Example Requests

Create a post:

bash
curl -X POST http://127.0.0.1:8000/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"My First Post","content":"Hello world"}'


Get all posts:

bash
curl http://127.0.0.1:8000/posts


Search posts:

bash
curl "http://127.0.0.1:8000/posts?search=hello"


Paginate posts:

bash
curl "http://127.0.0.1:8000/posts?skip=0&limit=10"


Get a single post:

bash
curl http://127.0.0.1:8000/posts/1


Update a post:

bash
curl -X PUT http://127.0.0.1:8000/posts/1 \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Title","content":"Updated Content"}'


Delete a post:

bash
curl -X DELETE http://127.0.0.1:8000/posts/1


---

## 🚀 GitHub Actions Setup

Add these workflows under `.github/workflows/` in your target repository:

### 📋 1. Pull Request Code Review (`.github/workflows/ai-review.yml`)
Runs whenever a PR is opened or updated, executing tests and placing comments on lines with issues.

yaml
name: AI Pull Request Reviewer

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write # Required to post inline review comments

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run AI Code Reviewer
        uses: zakerytclarke/infinite-monkey-agent@main
        with:
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          model: 'gpt-5.4'
          run_tests: 'true'


### 🚀 2. Autonomous Issue Developer (`.github/workflows/ai-developer.yml`)
Runs when a new issue is opened. The developer agent checks out code, runs a loop to implement modifications, pushes a branch, and opens a Pull Request.

yaml
name: AI Issue Developer

on:
  issues:
    types: [opened]

jobs:
  develop:
    runs-on: ubuntu-latest
    permissions:
      contents: write       # Required to checkout code, create branches, and push commits
      pull-requests: write  # Required to open the PR
      issues: write         # Required to leave comments linking back to the PR

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run AI Developer Agent
        uses: zakerytclarke/infinite-monkey-agent@main
        with:
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          model: 'gpt-5.4'
          run_tests: 'true'
          max_steps: '30' # Limit development loops to control execution time


---

## 🐍 Publishing to PyPI (Continuous Delivery)

Whenever a commit is merged or pushed directly to the `main` branch, a GitHub Action automatically builds the python source package and wheel, then deploys them to PyPI using Trusted Publishers.

See the release workflow config in [.github/workflows/release.yml](.github/workflows/release.yml).

---

## 📄 License

This project is licensed under the MIT License.
