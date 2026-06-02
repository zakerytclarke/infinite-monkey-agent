import sys
import os
import asyncio
from infinite_monkey_agent.config import load_config, Config
from infinite_monkey_agent.git_utils import get_diff, parse_diff
from infinite_monkey_agent.tester import run_tests
from infinite_monkey_agent.github_utils import print_workflow_annotations, post_github_review
from infinite_monkey_agent.develop import develop_issue
from infinite_monkey_agent.agent import run_reviewer_agent

# ANSI escape codes for styling
RESET = "\033[0m"
BOLD = "\033[1m"
RED = "\033[31m"
YELLOW = "\033[33m"
BLUE = "\033[34m"
GRAY = "\033[90m"
GREEN = "\033[32m"

def print_console_review(annotations: list[dict]):
    print(f"\n{BOLD}=== AI Code Review Results ==={RESET}\n")

    if not annotations:
        print(f"{GREEN}✔ No issues found. Looks good!{RESET}\n")
        return

    errors = [a for a in annotations if a.get("level") == "error"]
    warnings = [a for a in annotations if a.get("level") == "warning"]
    notices = [a for a in annotations if a.get("level") == "notice"]

    print(
        f"Found {BOLD}{len(annotations)}{RESET} issue(s): "
        f"{RED}{len(errors)} error(s){RESET}, "
        f"{YELLOW}{len(warnings)} warning(s){RESET}, "
        f"{BLUE}{len(notices)} suggestion(s){RESET}\n"
    )

    # Group by file
    grouped = {}
    for ann in annotations:
        file = ann.get("file", "unknown")
        if file not in grouped:
            grouped[file] = []
        grouped[file].append(ann)

    for file, file_anns in grouped.items():
        print(f"{BOLD}{file}{RESET}")
        
        # Sort by line
        sorted_anns = sorted(file_anns, key=lambda x: x.get("line", 0))

        for ann in sorted_anns:
            level = ann.get("level", "warning")
            if level == "error":
                badge = " ✖ ERROR "
                color = RED
            elif level == "warning":
                badge = " ⚠ WARN  "
                color = YELLOW
            else:
                badge = " ℹ INFO  "
                color = BLUE

            line = ann.get("line", 0)
            msg = ann.get("message", "")
            print(f"  {color}{BOLD}{badge}{RESET} {GRAY}Line {line}:{RESET} {msg}\n")

async def run_review_mode(config: Config):
    # 1. Run tests if configured
    test_passed = True
    test_output = None

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
    print("Fetching git diff...")
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
    annotations = await run_reviewer_agent(config, file_diffs, test_output)

    # 4. Publish results
    is_github_action = os.environ.get("GITHUB_ACTIONS") == "true"
    if is_github_action:
        print("Running in GitHub Actions environment.")
        print_workflow_annotations(annotations)
        
        if config.github_token:
            post_github_review(config, file_diffs, annotations, test_passed)
        else:
            print("GITHUB_TOKEN not provided, skipping inline PR comment posting.")
    else:
        print_console_review(annotations)

async def async_main():
    try:
        config = load_config()

        print("Initializing AI Reviewer & Developer CLI...")

        # Auto-detect mode if not explicitly set via subcommand
        run_mode = config.subcommand
        if not run_mode:
            if config.github_event_name == "issues":
                run_mode = "develop"
            elif config.github_event_name == "issue_comment":
                # Check if this comment is on a pull request or an issue
                event_path = config.github_event_path
                is_pr = False
                if event_path and os.path.exists(event_path):
                    try:
                        import json
                        with open(event_path, "r", encoding="utf-8") as f:
                            event_data = json.load(f)
                            if event_data.get("issue", {}).get("pull_request") is not None:
                                is_pr = True
                    except Exception:
                        pass
                run_mode = "review" if is_pr else "develop"
            else:
                run_mode = "review" # default behavior

        if run_mode == "develop":
            print("Mode: Autonomous Developer Agent")
            await develop_issue(config)
        else:
            print("Mode: Code Review Judge")
            await run_review_mode(config)

        sys.exit(0)
    except Exception as e:
        print(f"❌ Critical Error running AI CLI:", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

def main():
    asyncio.run(async_main())

if __name__ == "__main__":
    main()
