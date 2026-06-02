import os
import unittest
from infinite_monkey_agent.config import load_config

class TestConfig(unittest.TestCase):
    def setUp(self):
        # Backup environment variables
        self.old_env = dict(os.environ)
        # Clear existing keys to isolate tests
        for key in ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "INPUT_OPENROUTER_API_KEY", "INPUT_OPENAI_API_KEY", "INPUT_GEMINI_API_KEY", "AI_REVIEWER_MODEL", "INPUT_MODEL"]:
            if key in os.environ:
                del os.environ[key]

    def tearDown(self):
        # Restore environment variables
        os.environ.clear()
        os.environ.update(self.old_env)

    def test_default_model(self):
        cfg = load_config([])
        self.assertEqual(cfg.model, "gpt-5.4")

    def test_openai_only_fallback(self):
        os.environ["OPENAI_API_KEY"] = "sk-test-key"
        cfg = load_config([])
        self.assertEqual(cfg.openai_api_key, "sk-test-key")
        self.assertEqual(cfg.model, "gpt-5.4")

    def test_gemini_only_fallback(self):
        os.environ["GEMINI_API_KEY"] = "gemini-test-key"
        cfg = load_config([])
        self.assertEqual(cfg.gemini_api_key, "gemini-test-key")
        self.assertEqual(cfg.model, "gemini-2.5-pro")

    def test_explicit_model_kept(self):
        os.environ["OPENAI_API_KEY"] = "sk-test-key"
        os.environ["INPUT_MODEL"] = "gpt-5.5-thinking"
        cfg = load_config([])
        self.assertEqual(cfg.model, "gpt-5.5-thinking")

if __name__ == "__main__":
    unittest.main()
