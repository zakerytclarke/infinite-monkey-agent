import sys
import os
import asyncio
from typing import Optional
from infinite_monkey_agent.config import load_config, Config
from infinite_monkey_agent.develop import develop_issue
from infinite_monkey_agent.review import review_pr

async def async_main() -> None:
    try:
        config: Config = load_config()

        print("Initializing AI Reviewer & Developer CLI...")

        # Auto-detect mode if not explicitly set via subcommand
        run_mode: Optional[str] = config.subcommand
        if not run_mode:
            if config.github_event_name == "issues":
                run_mode = "develop"
            elif config.github_event_name == "issue_comment":
                # Check if this comment is on a pull request or an issue
                event_path: Optional[str] = config.github_event_path
                is_pr: bool = False
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
            await review_pr(config)

        sys.exit(0)
    except Exception as e:
        print(f"❌ Critical Error running AI CLI:", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

def main() -> None:
    asyncio.run(async_main())

if __name__ == "__main__":
    main()
