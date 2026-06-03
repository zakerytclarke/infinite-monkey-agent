import os
import shutil
import unittest
import asyncio
from unittest.mock import patch, MagicMock
from infinite_monkey_agent.config import Config
from infinite_monkey_agent.git_utils import FileDiff
from infinite_monkey_agent.agent import (
    run_developer_agent,
    run_reviewer_agent,
    execute_tool,
    resolve_safe_path
)

class TestAgentAndTools(unittest.TestCase):
    def setUp(self):
        # Create a clean sandbox directory for local file tests
        self.test_dir = os.path.abspath("./agent_test_sandbox")
        os.makedirs(self.test_dir, exist_ok=True)
        # Change current working directory to test_dir for safe execution
        self.old_cwd = os.getcwd()
        os.chdir(self.test_dir)

    def tearDown(self):
        # Restore cwd and clean up test directory
        os.chdir(self.old_cwd)
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_safe_path_resolver(self):
        # Test normal path resolution
        safe_path = resolve_safe_path("test.txt")
        self.assertEqual(safe_path, os.path.abspath("test.txt"))

        # Test directory traversal prevention
        with self.assertRaises(PermissionError):
            resolve_safe_path("../outside.txt")

        with self.assertRaises(PermissionError):
            resolve_safe_path("/absolute/path/outside")

    def test_file_tools_execution(self):
        # 1. Write file
        write_res = execute_tool("writeFile", {"path": "dummy.py", "content": "print('hello')"})
        self.assertIn("Successfully wrote content", write_res)
        self.assertTrue(os.path.exists("dummy.py"))

        # 2. Read file
        read_res = execute_tool("readFile", {"path": "dummy.py"})
        self.assertEqual(read_res, "print('hello')")

        # 3. List files
        list_res = execute_tool("listFiles", {})
        self.assertIn("dummy.py", list_res)

        # 4. Run command
        cmd_res = execute_tool("runCommand", {"command": "python dummy.py"})
        self.assertIn("Command finished with return code 0", cmd_res)
        self.assertIn("hello", cmd_res)

        # 5. Delete file
        del_res = execute_tool("deleteFile", {"path": "dummy.py"})
        self.assertIn("Successfully deleted file", del_res)
        self.assertFalse(os.path.exists("dummy.py"))

    def test_mock_developer_agent(self):
        config = Config()
        config.mock = True
        
        async def run():
            return await run_developer_agent(config, "title", "body")
            
        summary, thoughts = asyncio.run(run())
        self.assertIn("Fixed the SQL Injection", summary)
        self.assertTrue(len(thoughts) > 0)

    def test_mock_reviewer_agent(self):
        config = Config()
        config.mock = True
        
        from infinite_monkey_agent.git_utils import DiffHunk, DiffLine
        fd = FileDiff("src/routes/users.ts")
        hunk = DiffHunk("@@ -0,0 +1,1 @@", 0, 0, 1, 1)
        line = DiffLine("added", "LIKE '%${name}%'", new_line_number=20)
        hunk.lines.append(line)
        fd.hunks.append(hunk)
        file_diffs = [fd]
        
        async def run():
            return await run_reviewer_agent(config, file_diffs)
            
        comments, thoughts = asyncio.run(run())
        self.assertIsInstance(comments, list)
        self.assertTrue(len(comments) > 0)
        self.assertEqual(comments[0]["file"], "src/routes/users.ts")
        self.assertEqual(comments[0]["line"], 20)
        self.assertTrue(len(thoughts) > 0)

    @patch("requests.post")
    def test_agent_json_parsing_alternation(self, mock_post):
        # Mock requests to first return malformed JSON, and then a clean finish JSON
        mock_response_malformed = MagicMock()
        mock_response_malformed.status_code = 200
        mock_response_malformed.json.return_value = {
            "choices": [{
                "message": {
                    "content": "Here is some markdown that is invalid JSON: ```test```"
                }
            }]
        }
        
        mock_response_correct = MagicMock()
        mock_response_correct.status_code = 200
        mock_response_correct.json.return_value = {
            "choices": [{
                "message": {
                    "content": '{"thought": "done", "tool": "finish", "arguments": {"summary": "Completed successfully."}}'
                }
            }]
        }

        # Side effect: first return malformed, then correct response
        mock_post.side_effect = [mock_response_malformed, mock_response_correct]

        config = Config()
        config.openai_api_key = "test-key"
        config.model = "gpt-5.4"
        config.mock = False
        config.max_steps = 2

        async def run():
            return await run_developer_agent(config, "Fix typo", "description")

        summary, thoughts = asyncio.run(run())
        self.assertEqual(summary, "Completed successfully.")
        
        # Verify that requests.post was called twice
        self.assertEqual(mock_post.call_count, 2)
        
        # Check the history passed in the second call
        # The history should contain the assistant message (raw text) followed by a user error message,
        # ensuring role alternation was maintained.
        second_call_kwargs = mock_post.call_args_list[1][1]
        messages = second_call_kwargs.get("json", {}).get("messages", [])
        
        # Message 0: system prompt
        # Message 1: initial user prompt
        # Message 2: assistant malformed message (from step 1)
        # Message 3: user error message (complaining about JSON schema format)
        self.assertEqual(messages[2]["role"], "assistant")
        self.assertEqual(messages[2]["content"], "Here is some markdown that is invalid JSON: ```test```")
        self.assertEqual(messages[3]["role"], "user")
        self.assertIn("Error: Your output was not valid JSON", messages[3]["content"])

    def test_line_numbered_diff_format(self):
        from infinite_monkey_agent.git_utils import DiffHunk, DiffLine, format_line_numbered_diff
        fd = FileDiff("math_helper.py", is_new=True)
        hunk = DiffHunk("@@ -0,0 +1,2 @@", 0, 0, 1, 2)
        hunk.lines.append(DiffLine("added", "def add(a, b):", new_line_number=1))
        hunk.lines.append(DiffLine("added", "    return a + b", new_line_number=2))
        fd.hunks.append(hunk)
        
        formatted = format_line_numbered_diff([fd])
        self.assertIn("diff --git a/math_helper.py b/math_helper.py", formatted)
        self.assertIn("new file mode", formatted)
        self.assertIn("@@ -0,0 +1,2 @@", formatted)
        self.assertIn("+    1: def add(a, b):", formatted)
        self.assertIn("+    2:     return a + b", formatted)

    def test_extract_json_objects(self):
        from infinite_monkey_agent.agent import extract_json_objects

        # 1. Single valid JSON
        text = '{"thought": "done", "tool": "finish"}'
        res = extract_json_objects(text)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["tool"], "finish")

        # 2. Multiple JSON lines
        text = '{"tool": "leaveComment", "line": 2}\n{"tool": "finish"}'
        res = extract_json_objects(text)
        self.assertEqual(len(res), 2)
        self.assertEqual(res[0]["tool"], "leaveComment")
        self.assertEqual(res[1]["tool"], "finish")

        # 3. Markdown wrapped JSON
        text = 'some text before\n```json\n{"tool": "finish"}\n```\ntext after'
        res = extract_json_objects(text)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["tool"], "finish")

        # 4. Mix of invalid/text and valid JSON
        text = 'invalid { brace {\n{"tool": "finish"}'
        res = extract_json_objects(text)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["tool"], "finish")

if __name__ == "__main__":
    unittest.main()
