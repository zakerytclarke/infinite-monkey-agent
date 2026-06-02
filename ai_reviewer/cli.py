import sys
import asyncio
from ai_reviewer.config import load_config, Config
from ai_reviewer.git_utils import get_diff, parse_diff
from ai_reviewer.tester import run_tests
from ai_reviewer.llm import get_review_from_llm
from ai_reviewer.github_utils import print_workflow_annotations, post_github_review
from ai_reviewer.develop import develop_issue

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

    # 3. Call LLM
    review_result = get_review_from_llm(config, file_diffs, test_output)
    annotations = review_result.get("reviews", [])

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
