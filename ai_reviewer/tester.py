import os
import subprocess
import json

class TestResult:
    def __init__(self, run: bool, passed: bool, command: str = None, output: str = None, error: str = None):
        self.run = run
        self.passed = passed
        self.command = command
        self.output = output
        self.error = error

def run_tests(custom_command: str = None) -> TestResult:
    command = custom_command

    # Auto-detect test runner if not specified
    if not command:
        cwd = os.getcwd()

        # 1. Node.js (package.json)
        package_json_path = os.path.join(cwd, "package.json")
        if os.path.exists(package_json_path):
            try:
                with open(package_json_path, "r", encoding="utf-8") as f:
                    pkg = json.load(f)
                    if pkg.get("scripts") and pkg["scripts"].get("test") and pkg["scripts"]["test"] != 'echo "Error: no test specified" && exit 1':
                        command = "npm test"
            except Exception:
                pass

        # 2. Rust (Cargo.toml)
        if not command and os.path.exists(os.path.join(cwd, "Cargo.toml")):
            command = "cargo test"

        # 3. Python (pytest)
        if not command:
            has_python = os.path.exists(os.path.join(cwd, "requirements.txt")) or \
                         os.path.exists(os.path.join(cwd, "pyproject.toml")) or \
                         os.path.exists(os.path.join(cwd, "setup.py"))
            if has_python:
                command = "pytest"

        # 4. Go (go.mod)
        if not command and os.path.exists(os.path.join(cwd, "go.mod")):
            command = "go test ./..."

    if not command:
        return TestResult(run=False, passed=True)

    print(f"Running tests via: \"{command}\"...")

    try:
        # Run with 60-second timeout
        res = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=60
        )
        passed = (res.returncode == 0)
        output = f"{res.stdout}\n{res.stderr}".strip()
        return TestResult(run=True, passed=passed, command=command, output=output)
    except subprocess.TimeoutExpired as e:
        output = f"Test run timed out after 60 seconds.\n{e.stdout or ''}\n{e.stderr or ''}".strip()
        return TestResult(run=True, passed=False, command=command, output=output, error="TimeoutExpired")
    except Exception as e:
        return TestResult(run=True, passed=False, command=command, output=str(e), error=str(e))
