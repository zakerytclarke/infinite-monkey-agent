import os
import sys
import json

class Config:
    def __init__(self):
        self.openrouter_api_key = None
        self.openai_api_key = None
        self.gemini_api_key = None
        self.model = "gpt-5.5-instant"
        self.custom_prompt = None
        self.github_token = None
        self.run_tests = True
        self.test_command = None
        self.diff_file = None
        self.branch = "master"
        self.mock = False
        self.subcommand = None
        self.issue_file = None
        self.max_steps = 15
        
        # GitHub action standard environment variables
        self.github_event_path = os.environ.get("GITHUB_EVENT_PATH")
        self.github_repository = os.environ.get("GITHUB_REPOSITORY")
        self.github_ref = os.environ.get("GITHUB_REF")
        self.github_sha = os.environ.get("GITHUB_SHA")
        self.github_event_name = os.environ.get("GITHUB_EVENT_NAME")

def load_config(args=None) -> Config:
    if args is None:
        args = sys.argv[1:]

    config = Config()

    # 1. Parse Subcommand if present
    remaining_args = list(args)
    if remaining_args and not remaining_args[0].startswith("-"):
        cmd = remaining_args[0].lower()
        if cmd in ("review", "develop"):
            config.subcommand = cmd
            remaining_args.pop(0)

    # 2. Load from JSON config file if exists
    possible_config_files = ["ai-reviewer.json", ".ai-reviewer.json"]
    for filename in possible_config_files:
        if os.path.exists(filename):
            try:
                with open(filename, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for key, val in data.items():
                        # Map camelCase to snake_case
                        snake_key = "".join(["_" + c.lower() if c.isupper() else c for c in key]).lstrip("_")
                        if hasattr(config, snake_key):
                            setattr(config, snake_key, val)
                break
            except Exception as e:
                print(f"Warning: Failed to parse configuration file {filename}: {e}", file=sys.stderr)

    # 3. Load from Environment Variables (GitHub Action inputs take precedence)
    env = os.environ
    
    openrouter_key = env.get("INPUT_OPENROUTER_API_KEY") or env.get("OPENROUTER_API_KEY")
    if openrouter_key: config.openrouter_api_key = openrouter_key
    
    openai_key = env.get("INPUT_OPENAI_API_KEY") or env.get("OPENAI_API_KEY")
    if openai_key: config.openai_api_key = openai_key
    
    gemini_key = env.get("INPUT_GEMINI_API_KEY") or env.get("GEMINI_API_KEY")
    if gemini_key: config.gemini_api_key = gemini_key

    gh_token = env.get("INPUT_GITHUB_TOKEN") or env.get("GITHUB_TOKEN") or env.get("GH_TOKEN")
    if gh_token: config.github_token = gh_token

    input_model = env.get("INPUT_MODEL") or env.get("AI_REVIEWER_MODEL")
    if input_model: config.model = input_model

    input_prompt = env.get("INPUT_CUSTOM_PROMPT") or env.get("AI_REVIEWER_PROMPT")
    if input_prompt: config.custom_prompt = input_prompt

    input_run_tests = env.get("INPUT_RUN_TESTS") or env.get("AI_REVIEWER_RUN_TESTS")
    if input_run_tests is not None:
        config.run_tests = str(input_run_tests).lower() != "false"

    input_test_command = env.get("INPUT_TEST_COMMAND") or env.get("AI_REVIEWER_TEST_COMMAND")
    if input_test_command: config.test_command = input_test_command

    input_mock = env.get("INPUT_MOCK") or env.get("AI_REVIEWER_MOCK")
    if input_mock is not None:
        config.mock = str(input_mock).lower() == "true"

    input_max_steps = env.get("INPUT_MAX_STEPS") or env.get("AI_REVIEWER_MAX_STEPS")
    if input_max_steps:
        try:
            config.max_steps = int(input_max_steps)
        except ValueError:
            pass

    # 4. Load from CLI Arguments
    i = 0
    while i < len(remaining_args):
        arg = remaining_args[i]
        if arg in ("--branch", "-b") and i + 1 < len(remaining_args):
            config.branch = remaining_args[i + 1]
            i += 2
        elif arg in ("--model", "-m") and i + 1 < len(remaining_args):
            config.model = remaining_args[i + 1]
            i += 2
        elif arg in ("--prompt", "-p") and i + 1 < len(remaining_args):
            val = remaining_args[i + 1]
            if os.path.exists(val):
                with open(val, "r", encoding="utf-8") as f:
                    config.custom_prompt = f.read()
            else:
                config.custom_prompt = val
            i += 2
        elif arg in ("--diff-file", "-d") and i + 1 < len(remaining_args):
            config.diff_file = remaining_args[i + 1]
            i += 2
        elif arg == "--issue-file" and i + 1 < len(remaining_args):
            config.issue_file = remaining_args[i + 1]
            i += 2
        elif arg == "--max-steps" and i + 1 < len(remaining_args):
            try:
                config.max_steps = int(remaining_args[i + 1])
            except ValueError:
                pass
            i += 2
        elif arg == "--run-tests":
            config.run_tests = True
            i += 1
        elif arg == "--no-tests":
            config.run_tests = False
            i += 1
        elif arg == "--test-command" and i + 1 < len(remaining_args):
            config.test_command = remaining_args[i + 1]
            i += 2
        elif arg == "--mock":
            config.mock = True
            i += 1
        else:
            i += 1

    # 5. Model default fallback based on active API keys
    if config.openai_api_key and not config.openrouter_api_key and not config.gemini_api_key:
        if config.model in ("google/gemini-2.5-pro", "gpt-4o") or not config.model:
            config.model = "gpt-5.5-instant"
    elif config.gemini_api_key and not config.openrouter_api_key and not config.openai_api_key:
        if config.model in ("gpt-5.5-instant", "gpt-4o") or not config.model:
            config.model = "gemini-2.5-pro"

    return config
