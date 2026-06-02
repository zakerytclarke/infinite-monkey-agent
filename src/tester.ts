import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export interface TestResult {
  run: boolean;
  passed: boolean;
  command?: string;
  output?: string;
  error?: string;
}

/**
 * Automatically detect test scripts/runners and execute them.
 */
export function runTests(customCommand?: string): TestResult {
  let command = customCommand;

  // Auto-detect if no custom command is provided
  if (!command) {
    const cwd = process.cwd();

    // 1. Node.js (package.json)
    const packageJsonPath = path.join(cwd, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        if (pkg.scripts && pkg.scripts.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
          command = "npm test";
        }
      } catch {}
    }

    // 2. Rust (Cargo.toml)
    if (!command && fs.existsSync(path.join(cwd, "Cargo.toml"))) {
      command = "cargo test";
    }

    // 3. Python (pytest or unittest)
    if (!command) {
      const hasPython = fs.existsSync(path.join(cwd, "requirements.txt")) ||
                        fs.existsSync(path.join(cwd, "pyproject.toml")) ||
                        fs.existsSync(path.join(cwd, "setup.py"));
      if (hasPython) {
        // Check if pytest is preferred
        command = "pytest";
      }
    }

    // 4. Go (go.mod)
    if (!command && fs.existsSync(path.join(cwd, "go.mod"))) {
      command = "go test ./...";
    }
  }

  if (!command) {
    return { run: false, passed: true };
  }

  console.log(`Running tests via: "${command}"...`);

  try {
    // Run tests with a 60 second timeout
    const output = execSync(command, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
    });
    return {
      run: true,
      passed: true,
      command,
      output,
    };
  } catch (err: any) {
    // If it threw, it might be due to test failures (non-zero exit code) or timeout
    const stdout = err.stdout ? err.stdout.toString() : "";
    const stderr = err.stderr ? err.stderr.toString() : "";
    const combinedOutput = `${stdout}\n${stderr}`.trim();

    return {
      run: true,
      passed: false,
      command,
      output: combinedOutput || err.message,
      error: err.message,
    };
  }
}
