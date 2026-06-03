import os
import json
import requests
from typing import Optional, Union
from infinite_monkey_agent.config import Config
from infinite_monkey_agent.git_utils import FileDiff

def filter_valid_annotations(file_diffs: list[FileDiff], annotations: list[dict]) -> list[dict]:
    valid = []
    for ann in annotations:
        target_file = ann.get("file")
        target_line = ann.get("line")
        if not target_file or not target_line:
            continue
        
        # Find matching file diff
        fd = next((f for f in file_diffs if f.file == target_file), None)
        if not fd:
            continue

        # Check if line is an added line
        is_added = False
        for hunk in fd.hunks:
            for line in hunk.lines:
                if line.type == "added" and line.new_line_number == target_line:
                    is_added = True
                    break
            if is_added:
                break
        
        if is_added:
            valid.append(ann)
            
    return valid

def print_workflow_annotations(annotations: list[dict]):
    for ann in annotations:
        level = ann.get("level", "warning")
        level_str = "notice" if level == "notice" else "error" if level == "error" else "warning"
        file = ann.get("file", "")
        line = ann.get("line", "")
        # Escape newlines for GitHub Action command logs
        msg = ann.get("message", "").replace("\n", "%0A").replace("\r", "%0D")
        print(f"::{level_str} file={file},line={line}::{msg}")

def post_github_review(config: Config, file_diffs: list[FileDiff], annotations: list[dict], test_passed: bool, reviewer_thoughts: list[str] = None) -> None:
    gh_token: Optional[str] = config.github_token
    gh_repo: Optional[str] = config.github_repository
    event_path: Optional[str] = config.github_event_path

    if not gh_token or not gh_repo:
        print("Skipping GitHub PR review posting (missing token or repository).")
        return

    pr_number: Union[str, int, None] = config.pr_number
    commit_id: Optional[str] = config.github_sha

    if event_path and os.path.exists(event_path):
        try:
            with open(event_path, "r", encoding="utf-8") as f:
                event = json.load(f)
                pr_info = event.get("pull_request")
                if pr_info:
                    if not pr_number:
                        pr_number = pr_info.get("number")
                    if not commit_id:
                        commit_id = pr_info.get("head", {}).get("sha")
        except Exception as e:
            print(f"Failed to parse GitHub event JSON: {e}")

    # Fallback to get the HEAD commit if not resolved
    if not commit_id or commit_id in ("master", "main", ""):
        try:
            import subprocess
            commit_id = subprocess.check_output(["git", "rev-parse", "HEAD"], encoding="utf-8").strip()
        except Exception:
            pass

    if not pr_number:
        print("Skipping GitHub PR review posting (could not resolve PR number).")
        return

    if not commit_id:
        print("Skipping GitHub PR review posting (could not resolve HEAD commit SHA).")
        return

    valid_annotations = filter_valid_annotations(file_diffs, annotations)
    print(f"Filtered {len(annotations)} annotations to {len(valid_annotations)} valid diff line comments.")

    comments = []
    for ann in valid_annotations:
        badge = "❌ Error" if ann["level"] == "error" else "⚠️ Warning" if ann["level"] == "warning" else "💡 Suggestion"
        comments.append({
            "path": ann["file"],
            "line": ann["line"],
            "side": "RIGHT",
            "body": f"### AI Review: {badge}\n\n{ann['message']}"
        })

    url = f"https://api.github.com/repos/{gh_repo}/pulls/{pr_number}/reviews"
    
    summary_body = "### 🤖 AI Code Review Summary\n\n"
    if test_passed:
        summary_body += "✅ Verification tests passed successfully!\n\n"
    else:
        summary_body += "❌ Verification tests failed. Please check the logs.\n\n"

    if not valid_annotations:
        summary_body += "LGTM! I reviewed the diff and found no issues."
    else:
        summary_body += f"I have left {len(valid_annotations)} inline suggestion(s)/comment(s) on the changes."

    if reviewer_thoughts:
        summary_body += "\n\n<details>\n<summary>🤖 Verbatim Reviewer Chain of Thought</summary>\n\n"
        summary_body += "\n\n".join(reviewer_thoughts)
        summary_body += "\n</details>"


    body = {
        "commit_id": commit_id,
        "event": "COMMENT",
        "body": summary_body
    }
    if comments:
        body["comments"] = comments

    print(f"Submitting review to GitHub PR #{pr_number}...")
    headers = {
        "Authorization": f"token {gh_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ai-reviewer-action",
        "Content-Type": "application/json"
    }

    res = requests.post(url, headers=headers, json=body, timeout=30)
    if res.status_code not in (200, 201):
        print(f"Failed to post review to GitHub: {res.status_code} {res.reason}\n{res.text}")
    else:
        print("Successfully posted review to GitHub PR.")
