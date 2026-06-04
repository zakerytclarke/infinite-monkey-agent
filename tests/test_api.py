import os
import tempfile
import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from infinite_monkey_agent.api import Base, app, get_db


class TestFastAPICRUD(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_posts.db")
        self.engine = create_engine(
            f"sqlite:///{self.db_path}",
            connect_args={"check_same_thread": False},
        )
        self.SessionLocal = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)
        Base.metadata.create_all(bind=self.engine)

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_create_and_get_post(self):
        create_response = self.client.post(
            "/posts",
            json={"title": "My First Post", "content": "Hello world"},
        )
        self.assertEqual(create_response.status_code, 201)
        created = create_response.json()
        self.assertEqual(created["title"], "My First Post")
        self.assertEqual(created["content"], "Hello world")
        self.assertIn("id", created)
        self.assertIn("created_at", created)
        self.assertIn("updated_at", created)

        get_response = self.client.get(f"/posts/{created['id']}")
        self.assertEqual(get_response.status_code, 200)
        fetched = get_response.json()
        self.assertEqual(fetched["id"], created["id"])
        self.assertEqual(fetched["title"], "My First Post")

    def test_list_search_pagination_and_sorting(self):
        for idx, title in enumerate(["Alpha", "Beta", "Gamma"]):
            response = self.client.post(
                "/posts",
                json={"title": title, "content": f"content {idx}"},
            )
            self.assertEqual(response.status_code, 201)

        list_response = self.client.get("/posts")
        self.assertEqual(list_response.status_code, 200)
        posts = list_response.json()
        self.assertEqual(len(posts), 3)
        self.assertEqual(posts[0]["title"], "Gamma")
        self.assertEqual(posts[1]["title"], "Beta")
        self.assertEqual(posts[2]["title"], "Alpha")

        search_response = self.client.get("/posts", params={"search": "Beta"})
        self.assertEqual(search_response.status_code, 200)
        search_posts = search_response.json()
        self.assertEqual(len(search_posts), 1)
        self.assertEqual(search_posts[0]["title"], "Beta")

        page_response = self.client.get("/posts", params={"skip": 1, "limit": 1})
        self.assertEqual(page_response.status_code, 200)
        page_posts = page_response.json()
        self.assertEqual(len(page_posts), 1)
        self.assertEqual(page_posts[0]["title"], "Beta")

    def test_update_and_delete_post(self):
        create_response = self.client.post(
            "/posts",
            json={"title": "Old Title", "content": "Old Content"},
        )
        post_id = create_response.json()["id"]

        update_response = self.client.put(
            f"/posts/{post_id}",
            json={"title": "Updated Title", "content": "Updated Content"},
        )
        self.assertEqual(update_response.status_code, 200)
        updated = update_response.json()
        self.assertEqual(updated["title"], "Updated Title")
        self.assertEqual(updated["content"], "Updated Content")

        delete_response = self.client.delete(f"/posts/{post_id}")
        self.assertEqual(delete_response.status_code, 204)
        self.assertEqual(delete_response.text, "")

        missing_response = self.client.get(f"/posts/{post_id}")
        self.assertEqual(missing_response.status_code, 404)
        self.assertEqual(missing_response.json()["detail"], "Post not found")

    def test_missing_post_errors(self):
        self.assertEqual(self.client.get("/posts/999").status_code, 404)
        self.assertEqual(
            self.client.put(
                "/posts/999",
                json={"title": "Missing", "content": "Missing"},
            ).status_code,
            404,
        )
        self.assertEqual(self.client.delete("/posts/999").status_code, 404)


if __name__ == "__main__":
    unittest.main()
