import os
import json
import subprocess
import requests
from infinite_monkey_agent.config import Config
from infinite_monkey_agent.agent import run_developer_agent

async def develop_issue(config: Config):
    issue_file = config.issue_file
    event_path = config.github_event_path
    gh_token = config.github_token
    gh_repo = config.github_repository

    event_payload = {}

    # 1. Resolve issue details
    if issue_file:
        full_path = os.path.abspath(issue_file)
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"Issue file not found: {full_path}")
        with open(full_path, "r", encoding="utf-8") as f:
            event_payload = json.load(f)
    elif event_path and os.path.exists(event_path):
        try:
            with open(event_path, "r", encoding="utf-8") as f:
                event_payload = json.load(f)
        except Exception as e:
            raise RuntimeError(f"Failed to parse GitHub event JSON: {e}")
    else:
        raise ValueError("No issue file or GITHUB_EVENT_PATH provided. Use --issue-file to test locally.")

    issue = event_payload.get("issue")
    if not issue or not issue.get("number"):
        raise ValueError("Could not find issue details in the event payload.")

    issue_title = issue.get("title")
    issue_body = issue.get("body") or ""
    issue_number = issue.get("number")
    default_branch = event_payload.get("repository", {}).get("default_branch") or config.branch or "master"

    # 2. Fetch all comments for context if this is an issue
    comments_context = ""
    if gh_token and gh_repo and issue_number:
        try:
            print("Fetching issue comments for conversation context...")
            comments_url = f"https://api.github.com/repos/{gh_repo}/issues/{issue_number}/comments"
            headers = {
                "Authorization": f"token {gh_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "infinite-monkey-agent"
            }
            res = requests.get(comments_url, headers=headers, timeout=20)
            if res.status_code == 200:
                comments_list = res.json()
                if comments_list:
                    comments_context = "\n\n--- Issue Conversation History ---\n"
                    for idx, c in enumerate(comments_list, 1):
                        user = c.get("user", {}).get("login", "unknown")
                        body = c.get("body", "")
                        comments_context += f"Comment #{idx} by @{user}:\n{body}\n\n"
            else:
                print(f"Warning: Failed to fetch comments: {res.status_code} {res.reason}")
        except Exception as e:
            print(f"Warning: Error fetching comments: {e}")

    full_issue_body = issue_body
    if comments_context:
        full_issue_body += comments_context

    # 2. Execute developer agent
    summary_of_changes, developer_thoughts = await run_developer_agent(config, issue_title, full_issue_body)

    # Format thoughts as collapsible markdown
    thoughts_md = ""
    if developer_thoughts:
        thoughts_md += "\n\n<details>\n<summary>🧠 Developer Agent Thought Process</summary>\n\n"
        for idx, t in enumerate(developer_thoughts, 1):
            thoughts_md += f"**Step {idx}:** {t}\n\n"
        thoughts_md += "</details>"

    # Simulation in mock mode
    if config.mock:
        print("\n[MOCK] Git and GitHub Action Simulation:")
        print(f"[MOCK] Git Branch Created: \"ai-patch/issue-{issue_number}\"")
        print(f"[MOCK] Git Commit: \"AI: resolve issue #{issue_number} - {issue_title}\"")
        print(f"[MOCK] Git Push: Pushed branch \"ai-patch/issue-{issue_number}\" to origin")
        print(f"[MOCK] GitHub PR Opened: Created PR from \"ai-patch/issue-{issue_number}\" into \"{default_branch}\"")
        print(f"[MOCK] GitHub PR Url: https://github.com/{gh_repo or 'owner/repo'}/pull/123")
        print(f"[MOCK] GitHub Comment Posted: Link left on Issue #{issue_number}")
        
        # Write mock PR number output
        github_output_path = os.environ.get("GITHUB_OUTPUT")
        if github_output_path:
            try:
                with open(github_output_path, "a", encoding="utf-8") as f:
                    f.write("pr_number=123\n")
                print("Wrote mock pr_number=123 to GITHUB_OUTPUT.")
            except Exception as e:
                print(f"Warning: Failed to write GITHUB_OUTPUT: {e}")
        return

    # 3. Check for workspace modifications
    git_status = ""
    try:
        git_status = subprocess.check_output(["git", "status", "--porcelain"], encoding="utf-8").strip()
    except Exception:
        print("Warning: Failed to run git status. Assuming no changes.")

    if not git_status:
        print("No files were modified by the developer agent. Exiting without PR.")
        return

    print("\nFiles modified:\n" + git_status)

    # 4. Git checkout, commit, push
    patch_branch = f"ai-patch/issue-{issue_number}"
    print(f"Creating branch: \"{patch_branch}\"...")

    try:
        subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
        subprocess.run(["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], check=True)
        
        # Safely checkout branch
        res = subprocess.run(["git", "show-ref", f"refs/heads/{patch_branch}"], capture_output=True)
        if res.returncode == 0:
            subprocess.run(["git", "checkout", patch_branch], check=True)
        else:
            subprocess.run(["git", "checkout", "-b", patch_branch], check=True)
        subprocess.run(["git", "add", "."], check=True)
        subprocess.run(["git", "commit", "-m", f"AI: resolve issue #{issue_number} - {issue_title}"], check=True)
        
        print(f"Pushing branch \"{patch_branch}\" to origin...")
        subprocess.run(["git", "push", "origin", patch_branch, "--force"], check=True)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Git checkout/commit/push failed: {e}")

    # 5. Open Pull Request
    if not gh_token or not gh_repo:
        print("GITHUB_TOKEN or GITHUB_REPOSITORY is missing. Skipping Pull Request creation.")
        return

    pr_url = f"https://api.github.com/repos/{gh_repo}/pulls"
    pr_body = {
        "title": f"AI: Resolve Issue #{issue_number} - {issue_title}",
        "head": patch_branch,
        "base": default_branch,
        "body": f"Closes #{issue_number}\n\n### 🤖 Autonomous Developer Changes Summary\n\n{summary_of_changes}{thoughts_md}"
    }

    print("Opening GitHub Pull Request...")
    headers = {
        "Authorization": f"token {gh_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ai-reviewer-action",
        "Content-Type": "application/json"
    }

    res = requests.post(pr_url, headers=headers, json=pr_body, timeout=30)
    if res.status_code not in (200, 201):
        print(f"Failed to create Pull Request: {res.status_code} {res.reason}\n{res.text}")
        return

    pr_data = res.json()
    pr_html_url = pr_data.get("html_url")
    pr_number = pr_data.get("number")
    print(f"Successfully created Pull Request #{pr_number}: {pr_html_url}")

    # Write PR number output
    github_output_path = os.environ.get("GITHUB_OUTPUT")
    if github_output_path:
        try:
            with open(github_output_path, "a", encoding="utf-8") as f:
                f.write(f"pr_number={pr_number}\n")
            print(f"Wrote pr_number={pr_number} to GITHUB_OUTPUT.")
        except Exception as e:
            print(f"Warning: Failed to write to GITHUB_OUTPUT: {e}")

    # 6. Comment on Issue linking to PR
    comment_url = f"https://api.github.com/repos/{gh_repo}/issues/{issue_number}/comments"
    comment_body = {
        "body": f"🤖 Beep boop! I have attempted to resolve this issue in Pull Request #{pr_number} ({pr_html_url})." + thoughts_md
    }

    print(f"Adding link comment to Issue #{issue_number}...")
    res = requests.post(comment_url, headers=headers, json=comment_body, timeout=30)
    if res.status_code not in (200, 201):
        print(f"Failed to post issue comment: {res.status_code} {res.reason}\n{res.text}")
    else:
        print("Successfully posted issue comment.")
