# 🤖 AI Developer & Code Reviewer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![NPM version](https://img.shields.io/npm/v/@zakerytclarke/ai-reviewer.svg)](https://www.npmjs.com)
[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-Verified-blue.svg)](action.yml)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org)

An intelligent, lightweight, zero-dependency NPM library and GitHub Action that serves a dual role:
1. **AI Code Review Judge**: Evaluates Pull Request diffs, executes test verification, and posts precise inline PR reviews or workflow annotations.
2. **Autonomous Developer Agent**: Listens for created GitHub issues, executes a file-editing development loop (reads, writes, compiles, tests), pushes a branch, opens a Pull Request, and links it back to the issue.

---

## 📦 Installation (NPM CLI)

To install the CLI tool globally to run it in your local terminal:

```bash
npm install -g @zakerytclarke/ai-reviewer
```

Or run it directly using `npx`:

```bash
npx @zakerytclarke/ai-reviewer <command> [options]
```

---

## 🛠️ Subcommands & Local Usage

The CLI supports two primary modes:

### 1. Code Review Mode (`review`)
Runs a git diff against a branch and reviews code modifications.

```bash
# Review changes compared to master branch
ai-reviewer review --branch master

# Run review offline on a saved .diff file
ai-reviewer review --diff-file ./path/to/my.diff --mock
```

### 2. Autonomous Developer Mode (`develop`)
Solves an issue in a workspace loop until code compiles and tests pass.

```bash
# Run developer agent locally using a mock issue payload
ai-reviewer develop --issue-file ./test_cases/issue_payload.json --mock
```

---

## 📦 GitHub Actions Workflows Setup

Add these workflows in your repository under `.github/workflows/`:

### 📋 1. Pull Request Code Review (`.github/workflows/ai-review.yml`)
Runs whenever a PR is opened or updated, executing tests and placing comments on lines with issues.

```yaml
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
          fetch-depth: 0 # Required to fetch git history for diffing

      - name: Run AI Code Reviewer
        uses: zakerytclarke/ai-reviewer@v1
        with:
          openrouter_api_key: ${{ secrets.OPENROUTER_API_KEY }}
          model: 'google/gemini-2.5-pro'
          run_tests: 'true'
```

### 🚀 2. Autonomous Issue Developer (`.github/workflows/ai-developer.yml`)
Runs whenever a new issue is opened. The developer agent attempts to fix the bug, run tests, push the changes to a new branch, and create a Pull Request.

```yaml
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
        uses: zakerytclarke/ai-reviewer@v1
        with:
          openrouter_api_key: ${{ secrets.OPENROUTER_API_KEY }}
          model: 'google/gemini-2.5-pro'
          run_tests: 'true'
          max_steps: '15' # Limit development loops to control execution time
```

---

## 🔑 LLM Keys Configuration

Specify any of the following environment keys or inputs to authenticate:

- **OpenRouter (Default)**: Set `openrouter_api_key` input or `OPENROUTER_API_KEY` env.
- **OpenAI**: Set `openai_api_key` input or `OPENAI_API_KEY` env.
- **Gemini**: Set `gemini_api_key` input or `GEMINI_API_KEY` env.

---

## 🛠️ Configuration Options File

You can also place an `ai-reviewer.json` or `.ai-reviewer.json` in the root of your project to store parameters:

```json
{
  "model": "google/gemini-2.5-pro",
  "runTests": true,
  "branch": "main",
  "maxSteps": 15,
  "customPrompt": "Please look out for any security issues, especially raw SQL statements, and enforce camelCase variable naming."
}
```

---

## 📄 License

This project is licensed under the MIT License.