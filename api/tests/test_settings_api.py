"""Tests for chat sampling parameters, bulk history clearing, and capabilities.

Run from the repository root:

    python3 -m unittest discover -s api/tests -v
"""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

import support  # noqa: F401  (sets up env before app imports)

from fastapi.testclient import TestClient  # noqa: E402

from app import app  # noqa: E402
from models import Conversation, Message, get_db  # noqa: E402


class ChatSettingsApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client.__exit__(None, None, None)

    def setUp(self) -> None:
        db = get_db()
        try:
            db.query(Message).delete()
            db.query(Conversation).delete()
            db.commit()
        finally:
            db.close()

    # ----------------------------------------------------- sampling params

    def test_chat_passes_top_p_and_accepts_8192_tokens(self) -> None:
        fake_chat = AsyncMock(
            return_value={
                "content": "ok",
                "usage": {"completion_tokens": 1},
                "model": "test-model",
            }
        )

        with patch("routes.chat.chat", new=fake_chat):
            response = self.client.post(
                "/api/chat",
                json={
                    "messages": [{"role": "user", "content": "Hello"}],
                    "temperature": 1.1,
                    "max_tokens": 8192,
                    "top_p": 0.42,
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        kwargs = fake_chat.await_args.kwargs
        self.assertEqual(kwargs["temperature"], 1.1)
        self.assertEqual(kwargs["max_tokens"], 8192)
        self.assertEqual(kwargs["top_p"], 0.42)

    def test_chat_rejects_tokens_above_shared_limit(self) -> None:
        response = self.client.post(
            "/api/chat",
            json={
                "messages": [{"role": "user", "content": "Hello"}],
                "max_tokens": 8193,
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_chat_rejects_invalid_top_p(self) -> None:
        for value in (-0.1, 1.1):
            response = self.client.post(
                "/api/chat",
                json={
                    "messages": [{"role": "user", "content": "Hello"}],
                    "top_p": value,
                },
            )
            self.assertEqual(response.status_code, 422, value)

    def test_stream_passes_top_p(self) -> None:
        captured: dict = {}

        async def fake_stream(**kwargs):
            captured.update(kwargs)
            yield {"content": "streamed"}
            yield {"done": True}

        with patch("chat_service.stream_chat", new=fake_stream):
            response = self.client.post(
                "/api/chat/stream",
                json={
                    "messages": [{"role": "user", "content": "Hello"}],
                    "temperature": 0.6,
                    "max_tokens": 4096,
                    "top_p": 0.33,
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(captured["temperature"], 0.6)
        self.assertEqual(captured["max_tokens"], 4096)
        self.assertEqual(captured["top_p"], 0.33)

    # -------------------------------------------------------- clear history

    def test_clear_history_deletes_all_conversations_and_messages(self) -> None:
        for title in ("First", "Second"):
            created = self.client.post(
                "/api/chat/conversations", json={"title": title}
            )
            conversation_id = created.json()["id"]
            self.client.post(
                f"/api/chat/conversations/{conversation_id}/messages",
                json={"role": "user", "content": "hello"},
            )
            self.client.post(
                f"/api/chat/conversations/{conversation_id}/messages",
                json={"role": "assistant", "content": "hi"},
            )

        response = self.client.delete("/api/chat/conversations")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["success"])
        self.assertEqual(response.json()["deleted"], 2)

        self.assertEqual(self.client.get("/api/chat/conversations").json(), [])

        db = get_db()
        try:
            self.assertEqual(db.query(Conversation).count(), 0)
            self.assertEqual(db.query(Message).count(), 0)
        finally:
            db.close()

    # ------------------------------------------------------- capabilities

    def test_capabilities_advertise_only_supported_actions(self) -> None:
        response = self.client.get("/api/system/capabilities")
        self.assertEqual(response.status_code, 200, response.text)

        body = response.json()
        self.assertTrue(body["clear_history"]["supported"])
        self.assertFalse(body["clear_cache"]["supported"])
        self.assertTrue(body["clear_cache"]["reason"])
        self.assertFalse(body["clear_documents"]["supported"])


if __name__ == "__main__":
    unittest.main()
