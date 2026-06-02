import os
import subprocess
import re

class DiffLine:
    def __init__(self, line_type: str, content: str, new_line_number: int = None, old_line_number: int = None):
        self.type = line_type  # "added", "deleted", "normal"
        self.content = content
        self.new_line_number = new_line_number
        self.old_line_number = old_line_number

    def to_dict(self):
        return {
            "type": self.type,
            "content": self.content,
            "newLineNumber": self.new_line_number,
            "oldLineNumber": self.old_line_number
        }

class DiffHunk:
    def __init__(self, header: str, old_start: int, old_lines: int, new_start: int, new_lines: int):
        self.header = header
        self.old_start = old_start
        self.old_lines = old_lines
        self.new_start = new_start
        self.new_lines = new_lines
        self.lines = []

    def to_dict(self):
        return {
            "header": self.header,
            "oldStart": self.old_start,
            "oldLines": self.old_lines,
            "newStart": self.new_start,
            "newLines": self.new_lines,
            "lines": [l.to_dict() for l in self.lines]
        }

class FileDiff:
    def __init__(self, file: str, is_new: bool = False, is_deleted: bool = False):
        self.file = file
        self.is_new = is_new
        self.is_deleted = is_deleted
        self.hunks = []
        self.raw_content = ""

    def to_dict(self):
        return {
            "file": self.file,
            "isNew": self.is_new,
            "isDeleted": self.is_deleted,
            "hunks": [h.to_dict() for h in self.hunks],
            "rawContent": self.raw_content
        }

def get_diff(diff_file: str = None, branch: str = "master") -> str:
    if diff_file:
        full_path = os.path.abspath(diff_file)
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"Diff file not found: {full_path}")
        with open(full_path, "r", encoding="utf-8") as f:
            return f.read()

    # Verify inside git repo
    try:
        subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        raise RuntimeError("Not a git repository and no --diff-file was provided.")

    try:
        # Try fetching origin/branch
        try:
            subprocess.run(["git", "fetch", "origin", branch], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        except Exception:
            pass

        target = branch
        try:
            subprocess.run(["git", "rev-parse", "--verify", f"origin/{branch}"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            target = f"origin/{branch}"
        except subprocess.CalledProcessError:
            pass

        output = subprocess.check_output(["git", "diff", f"{target}...HEAD"], encoding="utf-8")
        return output
    except Exception as e:
        try:
            output = subprocess.check_output(["git", "diff", branch], encoding="utf-8")
            return output
        except Exception as e2:
            raise RuntimeError(f"Failed to get git diff against {branch}: {e2}")

def parse_diff(diff_text: str) -> list[FileDiff]:
    file_diffs = []
    lines = diff_text.splitlines()
    
    current_file = None
    current_hunk = None
    new_line_num = 0
    old_line_num = 0

    for i, line in enumerate(lines):
        if line.startswith("diff --git "):
            current_file = FileDiff("")
            current_file.raw_content = line + "\n"
            file_diffs.append(current_file)
            current_hunk = None
            continue

        if not current_file:
            continue

        current_file.raw_content += line + "\n"

        if line.startswith("new file mode "):
            current_file.is_new = True
            continue

        if line.startswith("deleted file mode "):
            current_file.is_deleted = True
            continue

        if line.startswith("--- "):
            continue

        if line.startswith("+++ "):
            match = re.match(r"^\+\+\+\s+b/(.+)$", line)
            if match:
                current_file.file = match.group(1)
            elif "/dev/null" in line:
                prev_line = lines[i - 1]
                prev_match = re.match(r"^---\s+a/(.+)$", prev_line)
                if prev_match:
                    current_file.file = prev_match.group(1)
            continue

        if line.startswith("@@ "):
            match = re.match(r"^@@\s+-(\d+),?(\d*)\s+\+(\d+),?(\d*)\s+@@", line)
            if match:
                old_start = int(match.group(1))
                old_lines = int(match.group(2)) if match.group(2) else 1
                new_start = int(match.group(3))
                new_lines = int(match.group(4)) if match.group(4) else 1

                current_hunk = DiffHunk(line, old_start, old_lines, new_start, new_lines)
                current_file.hunks.append(current_hunk)

                old_line_num = old_start
                new_line_num = new_start
            continue

        if current_hunk:
            if line.startswith("+"):
                current_hunk.lines.append(DiffLine("added", line[1:], new_line_number=new_line_num))
                new_line_num += 1
            elif line.startswith("-"):
                current_hunk.lines.append(DiffLine("deleted", line[1:], old_line_number=old_line_num))
                old_line_num += 1
            elif line.startswith(" ") or line == "":
                content = line[1:] if line.startswith(" ") else line
                current_hunk.lines.append(DiffLine("normal", content, new_line_number=new_line_num, old_line_number=old_line_num))
                new_line_num += 1
                old_line_num += 1

    return [f for f in file_diffs if f.file != ""]

def get_full_file_content(file_path: str) -> str:
    full_path = os.path.abspath(file_path)
    if os.path.exists(full_path) and os.path.isfile(full_path):
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception:
            return None
    return None

def format_line_numbered_diff(file_diffs: list[FileDiff]) -> str:
    output = []
    for fd in file_diffs:
        output.append(f"diff --git a/{fd.file} b/{fd.file}")
        if fd.is_new:
            output.append("new file mode")
        elif fd.is_deleted:
            output.append("deleted file")
            
        for hunk in fd.hunks:
            output.append(hunk.header)
            for line in hunk.lines:
                if line.type == "added":
                    prefix = f"+ {line.new_line_number:4d}: "
                elif line.type == "deleted":
                    prefix = f"- {line.old_line_number:4d}: "
                else:
                    prefix = f"  {line.new_line_number:4d}: "
                output.append(prefix + line.content)
    return "\n".join(output)
