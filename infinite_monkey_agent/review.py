import os
import sys
import requests
from typing import Optional
from infinite_monkey_agent.config import Config
from infinite_monkey_agent.git_utils import get_diff, parse_diff
from infinite_monkey_agent.tester import run_tests
from infinite_monkey_agent.github_utils import print_workflow_annotations, post_github_review
from infinite_monkey_agent.agent import run_reviewer_agent

# ANSI escape codes for styling
RESET: str = "\033[0m"
BOLD: str = "\033[1m"
RED: str = "\033[31m"
YELLOW: str = "\033[33m"
BLUE: str = "\033[34m"
GRAY: str = "\033[90m"
GREEN: str = "\033[32m"

def print_console_review(annotations: list[dict]) -> None:
    """Print code review results to the console."""
    print(f"\n{BOLD}=== AI Code Review Results ==={RESET}\n")

    if not annotations:
        print(f"{GREEN}✔ No issues found. Looks good!{RESET}\n")
        return

    errors: list[dict] = [a for a in annotations if a.get("level") == "error"]
    warnings: list[dict] = [a for a in annotations if a.get("level") == "warning"]
    notices: list[dict] = [a for a in annotations if a.get("level") == "notice"]

    print(
        f"Found {BOLD}{len(annotations)}{RESET} issue(s): "
        f"{RED}{len(errors)} error(s){RESET}, "
        f"{YELLOW}{len(warnings)} warning(s){RESET}, "
        f"{BLUE}{len(notices)} suggestion(s){RESET}\n"
    )

    # Group by file
    grouped: dict[str, list[dict]] = {}
    for ann in annotations:
        file: str = ann.get("file", "unknown")
        if file not in grouped:
            grouped[file] = []
            
        grouped[file].append(ann)

    for file, file_anns in grouped.items():
        print(f"{BOLD}{file}{RESET}")
        
        # Sort by line
        sorted_anns: list[dict] = sorted(file_anns, key=lambda x: x.get("line", 0))

        for ann in sorted_anns:
            level: str = ann.get("level", "warning")
            if level == "error":
                badge: str = " ✖ ERROR "
                color: str = RED
            elif level == "warning":
                badge = " ⚠ WARN  "
                color = YELLOW
            else:
                badge = " ℹ INFO  "
                color = BLUE

            line: int = ann.get("line", 0)
            msg: str = ann.get("message", "")
            print(f"  {color}{BOLD}{badge}{RESET} {GRAY}Line {line}:{RESET} {msg}\n")

async def review_pr(config: Config) -> None:
    """Run the code review workflow, calling tests, computing diff, and posting to GitHub."""
    # 1. Run tests if configured
    test_passed: bool = True
    test_output: Optional[str] = None

    if config.run_tests:
        test_result = run_tests(config.test_command)
        if test_result.run:
            test_passed = test_result.passed
            if not test_passed:
                test_output = test_result.output
                print("⚠️ Warning: Verification tests failed. Test failures will be sent to the AI for analysis.")
            else:
                print("✅ Verification tests passed.")
        else:
            print("No tests detected or run.")

    # 2. Fetch and parse diff
    diff_text: str = ""
    # Try fetching diff from GitHub PR if available
    if config.pr_number and config.github_token and config.github_repository:
        print(f"Fetching diff from GitHub PR #{config.pr_number}...")
        pr_url = f"https://api.github.com/repos/{config.github_repository}/pulls/{config.pr_number}"
        headers = {
            "Authorization": f"token {config.github_token}",
            "Accept": "application/vnd.github.diff",
            "User-Agent": "ai-reviewer-action"
        }
        try:
            res = requests.get(pr_url, headers=headers, timeout=30)
            if res.status_code == 200:
                diff_text = res.text
                print(f"Successfully retrieved diff for PR #{config.pr_number} from GitHub API ({len(diff_text)} chars).")
            else:
                print(f"Warning: Failed to fetch diff from GitHub API (status: {res.status_code}). Falling back to local git diff.")
        except Exception as e:
            print(f"Warning: Error fetching diff from GitHub API: {e}. Falling back to local git diff.")

    if not diff_text:
        print("Fetching git diff locally...")
        diff_text = get_diff(config.diff_file, config.branch)

    if not diff_text.strip():
        print("No code changes found to review.")
        return

    file_diffs = parse_diff(diff_text)
    if not file_diffs:
        print("No parseable file diffs found.")
        return

    print(f"Found {len(file_diffs)} modified file(s) to review.")

    # 3. Call Reviewer Agent Loop
    annotations, reviewer_thoughts = await run_reviewer_agent(config, file_diffs, test_output)

    # 4. Publish results
    is_github_action: bool = os.environ.get("GITHUB_ACTIONS") == "true"
    if is_github_action:
        print("Running in GitHub Actions environment.")
        print_workflow_annotations(annotations)
        
        if config.github_token:
            post_github_review(config, file_diffs, annotations, test_passed, reviewer_thoughts)
        else:
            print("GITHUB_TOKEN not provided, skipping inline PR comment posting.")
    else:
        print_console_review(annotations)
