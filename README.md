# 🐍 AI Developer & Code Reviewer (Python Edition)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PyPI version](https://img.shields.io/pypi/v/ai-reviewer.svg)](https://pypi.org/project/ai-reviewer/)
[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-Verified-blue.svg)](action.yml)
[![Python](https://img.shields.io/badge/Python-%3E%3D3.8-green.svg)](https://python.org)

An intelligent, lightweight, zero-dependency Python package and GitHub Action that serves a dual role:
1. **AI Code Review Judge**: Evaluates Pull Request diffs, runs test suites, and leaves inline review comments or workflow annotations.
2. **Autonomous Developer Agent**: Listens for created issues, executes a tool-calling development loop (reads files, writes fixes, runs tests), pushes code to a branch, opens a Pull Request, and links it back to the issue.

---

## 📦 Installation

To install the CLI tool globally or in your local python environment:

```bash
pip install ai-reviewer
```

To run it locally in development mode from the cloned source directory:

```bash
# In the repository root
pip install .
```

---

## 🛠️ CLI Subcommands & Local Usage

Once installed, the CLI tool can be executed using the `ai-reviewer` command:

### 1. PR Code Review Mode (`review`)
Runs a git diff against a branch and reviews code modifications.

```bash
# Review changes compared to main branch
ai-reviewer review --branch main

# Run review offline on a saved .diff file (mock LLM mode)
ai-reviewer review --diff-file ./path/to/my.diff --mock
```

### 2. Autonomous Developer Mode (`develop`)
Solves an issue in a workspace loop until code compiles and tests pass.

```bash
# Run developer agent locally using a mock issue payload
ai-reviewer develop --issue-file ./issue_payload.json --mock
```

---

## 🚀 GitHub Actions Setup

Add these workflows under `.github/workflows/` in your target repository:

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
          fetch-depth: 0

      - name: Run AI Code Reviewer
        uses: zakerytclarke/ai-reviewer@main
        with:
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          model: 'google/gemini-2.5-pro'
          run_tests: 'true'
```

### 🚀 2. Autonomous Issue Developer (`.github/workflows/ai-developer.yml`)
Runs when a new issue is opened. The developer agent checks out code, runs a loop to implement modifications, pushes a branch, and opens a Pull Request.

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
        uses: zakerytclarke/ai-reviewer@main
        with:
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          model: 'google/gemini-2.5-pro'
          run_tests: 'true'
          max_steps: '15' # Limit development loops to control execution time
```

---

## 🐍 Publishing to PyPI (Continuous Delivery)

Whenever a commit is merged or pushed directly to the `main` branch, a GitHub Action automatically builds the python source package and wheel, then deploys them to PyPI using Trusted Publishers.

See the release workflow config in [.github/workflows/release.yml](.github/workflows/release.yml).

---

## 🔑 Authentication Settings

Configure any of the following environment keys or inputs to authenticate:

- **OpenRouter**: Set `openrouter_api_key` input or `OPENROUTER_API_KEY` env.
- **OpenAI**: Set `openai_api_key` input or `OPENAI_API_KEY` env.
- **Gemini**: Set `gemini_api_key` input or `GEMINI_API_KEY` env.

---

## 📄 License

This project is licensed under the MIT License.