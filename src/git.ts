import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export interface DiffLine {
  type: "added" | "deleted" | "normal";
  content: string;
  newLineNumber?: number;
  oldLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  file: string;
  isNew: boolean;
  isDeleted: boolean;
  hunks: DiffHunk[];
  rawContent: string;
}

/**
 * Get the diff either from a file or by executing a git command.
 */
export function getDiff(diffFile?: string, branch: string = "master"): string {
  if (diffFile) {
    const fullPath = path.resolve(process.cwd(), diffFile);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Diff file not found: ${fullPath}`);
    }
    return fs.readFileSync(fullPath, "utf-8");
  }

  try {
    // Check if in git repository
    execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" });
  } catch {
    throw new Error("Not a git repository and no --diff-file was provided.");
  }

  // Get current diff against target branch (usually master/main)
  try {
    // Fetch target branch first to make sure it's up to date, but ignore errors if offline/local
    try {
      execSync(`git fetch origin ${branch}`, { stdio: "ignore" });
    } catch {}

    // First try diffing against origin/branch, fall back to local branch
    let target = branch;
    try {
      execSync(`git rev-parse --verify origin/${branch}`, { stdio: "ignore" });
      target = `origin/${branch}`;
    } catch {}

    // Run git diff
    return execSync(`git diff ${target}...HEAD`, { encoding: "utf-8" });
  } catch (err) {
    // Fall back to simple git diff with target branch
    try {
      return execSync(`git diff ${branch}`, { encoding: "utf-8" });
    } catch (err2: any) {
      throw new Error(`Failed to get git diff against ${branch}: ${err2?.message || err2}`);
    }
  }
}

/**
 * Parse a unified diff into FileDiff objects.
 */
export function parseDiff(diffText: string): FileDiff[] {
  const fileDiffs: FileDiff[] = [];
  const lines = diffText.split(/\r?\n/);
  
  let currentFile: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let newLineNum = 0;
  let oldLineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("diff --git ")) {
      // Start of a new file diff
      currentFile = {
        file: "",
        isNew: false,
        isDeleted: false,
        hunks: [],
        rawContent: line + "\n",
      };
      fileDiffs.push(currentFile);
      currentHunk = null;
      continue;
    }

    if (!currentFile) {
      continue;
    }

    currentFile.rawContent += line + "\n";

    if (line.startsWith("new file mode ")) {
      currentFile.isNew = true;
      continue;
    }

    if (line.startsWith("deleted file mode ")) {
      currentFile.isDeleted = true;
      continue;
    }

    if (line.startsWith("--- ")) {
      // e.g., --- a/src/lib/offer-eligibility.ts or --- /dev/null
      continue;
    }

    if (line.startsWith("+++ ")) {
      // e.g., +++ b/src/lib/offer-eligibility.ts or +++ /dev/null
      const match = line.match(/^\+\+\+\s+b\/(.+)$/);
      if (match) {
        currentFile.file = match[1];
      } else if (line.includes("/dev/null")) {
        // If new path is null, it's deleted. Get file path from previous --- a/ line
        const prevLine = lines[i - 1];
        const prevMatch = prevLine.match(/^---\s+a\/(.+)$/);
        if (prevMatch) {
          currentFile.file = prevMatch[1];
        }
      }
      continue;
    }

    if (line.startsWith("@@ ")) {
      // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@
      const match = line.match(/^@@\s+-(\d+),?(\d*)\s+\+(\d+),?(\d*)\s+@@/);
      if (match) {
        const oldStart = parseInt(match[1], 10);
        const oldLines = match[2] ? parseInt(match[2], 10) : 1;
        const newStart = parseInt(match[3], 10);
        const newLines = match[4] ? parseInt(match[4], 10) : 1;

        currentHunk = {
          header: line,
          oldStart,
          oldLines,
          newStart,
          newLines,
          lines: [],
        };
        currentFile.hunks.push(currentHunk);

        oldLineNum = oldStart;
        newLineNum = newStart;
      }
      continue;
    }

    if (currentHunk) {
      if (line.startsWith("+")) {
        currentHunk.lines.push({
          type: "added",
          content: line.slice(1),
          newLineNumber: newLineNum,
        });
        newLineNum++;
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({
          type: "deleted",
          content: line.slice(1),
          oldLineNumber: oldLineNum,
        });
        oldLineNum++;
      } else if (line.startsWith(" ") || line === "") {
        currentHunk.lines.push({
          type: "normal",
          content: line.startsWith(" ") ? line.slice(1) : line,
          newLineNumber: newLineNum,
          oldLineNumber: oldLineNum,
        });
        newLineNum++;
        oldLineNum++;
      }
    }
  }

  // Filter out any file diffs that didn't successfully parse the file name
  return fileDiffs.filter(f => f.file !== "");
}

/**
 * Reads the full content of a file from disk if it exists.
 */
export function getFullFileContent(filePath: string): string | null {
  const fullPath = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    try {
      return fs.readFileSync(fullPath, "utf-8");
    } catch {
      return null;
    }
  }
  return null;
}
