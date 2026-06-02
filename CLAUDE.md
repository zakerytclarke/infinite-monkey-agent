# CLAUDE.md - Coding Standards and Guidelines

This file outlines the programming standards, code formatting guidelines, typing rules, and utility commands expected for this repository. 

The AI agent reviewer and developers will read this file and strictly enforce these patterns.

---

## 🛠️ Common Commands

Use the following commands to test, run, and manage the code:

- **Run all unit tests**: `pytest`
- **Run specific test file**: `pytest tests/test_agent.py`
- **Execute local agent mock run**: `python -m infinite_monkey_agent.cli develop --issue-file ./issue_payload.json --mock`
- **Execute local reviewer mock run**: `python -m infinite_monkey_agent.cli review --branch HEAD~1 --mock`
- **Build wheel package locally**: `pip install .`

---

## 🐍 Python Coding Standards

### 1. Strict Typing Requirements
- **Type Hints**: All functions, methods, and class interfaces **must** have explicit type annotations for both arguments and return values.
  - *Incorrect:* `def process(data):`
  - *Correct:* `def process(data: dict) -> list[str]:`
- **Built-in collections**: Use standard capitalized generic collections for Python >= 3.9 (e.g. `list[str]`, `dict[str, int]`, `tuple[int, ...]`) instead of importing from the `typing` module unless backwards compatibility is required.
- **Complex Types**: Use `Optional[T]` or union typing (e.g. `str | None` for Python >= 3.10) where values can be `None`.

### 2. Formatting & Style
- **Indentation**: Use 4 spaces per indentation level. Never use tab characters.
- **Naming Conventions**:
  - **Functions / Variables**: Use `snake_case` (e.g. `load_config`, `api_key`).
  - **Classes**: Use `PascalCase` (e.g. `TestConfig`, `FileDiff`).
  - **Constants**: Use `UPPERCASE_SNAKE_CASE` (e.g. `MAX_STEPS_LIMIT`).
- **Docstrings**: Include descriptive docstrings for modules and complex classes/functions detailing input assumptions and exceptions raised.

### 3. Error Handling
- **Exceptions**: Always catch specific exceptions instead of using bare `except:`.
- **Graceful Failures**: Wrap network calls, subprocesses, and filesystem modifications in `try...except` blocks and return informative strings or errors rather than throwing unhandled exceptions in the agent loop.
