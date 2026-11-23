"""Tests for conversation persistence and chat turn persistence.

Run from the repository root:

    python3 -m unittest discover -s api/tests -v
"""

from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

import support  # noqa: F401  (sets up env before app imports)

from fastapi.testclient import TestClient  # noqa: E402

from app import app  # noqa: E402
from chat_service import stream_and_persist  # noqa: E402
from conversations import prepare_turn  # noqa: E402
from models import Conversation, Message, get_db  # noqa: E402


def _create_conversation(client: TestClient, **payload) -> dict:
    response = client.post("/api/chat/conversations", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


class ConversationApiTests(unittest.TestCase):
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

    # ------------------------------------------------------------- CRUD

    def test_create_conversation(self) -> None:
        body = _create_conversation(self.client, title="My chat", model="model-1")
        self.assertEqual(body["title"], "My chat")
        self.assertEqual(body["model"], "model-1")
        self.assertEqual(body["message_count"], 0)
        self.assertIsNotNone(body["created_at"])

        fetched = self.client.get(f"/api/chat/conversations/{body['id']}")
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()["title"], "My chat")

    def test_create_conversation_with_default_title(self) -> None:
        body = _create_conversation(self.client)
        self.assertEqual(body["title"], "New Conversation")

    def test_add_user_and_assistant_messages(self) -> None:
        conversation = _create_conversation(self.client)
        conversation_id = conversation["id"]

        user = self.client.post(
            f"/api/chat/conversations/{conversation_id}/messages",
            json={"role": "user", "content": "Hello there"},
        )
        self.assertEqual(user.status_code, 201, user.text)
        self.assertEqual(user.json()["role"], "user")
        self.assertEqual(user.json()["content"], "Hello there")

        assistant = self.client.post(
            f"/api/chat/conversations/{conversation_id}/messages",
            json={"role": "assistant", "content": "Hi!", "tokens": 3},
        )
        self.assertEqual(assistant.status_code, 201, assistant.text)
        self.assertEqual(assistant.json()["tokens"], 3)

        # First user message becomes the title.
        fetched = self.client.get(f"/api/chat/conversations/{conversation_id}")
        body = fetched.json()
        self.assertEqual(body["title"], "Hello there")
        self.assertEqual(body["message_count"], 2)
        self.assertEqual(
            [message["role"] for message in body["messages"]],
            ["user", "assistant"],
        )
        self.assertEqual(
            [message["content"] for message in body["messages"]],
            ["Hello there", "Hi!"],
        )

    def test_rename_conversation(self) -> None:
        conversation = _create_conversation(self.client, title="Old title")

        response = self.client.patch(
            f"/api/chat/conversations/{conversation['id']}",
            json={"title": "New title"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["title"], "New title")

        fetched = self.client.get(
            f"/api/chat/conversations/{conversation['id']}"
        ).json()
        self.assertEqual(fetched["title"], "New title")

    def test_delete_conversation_removes_messages(self) -> None:
        conversation = _create_conversation(self.client)
        conversation_id = conversation["id"]

        self.client.post(
            f"/api/chat/conversations/{conversation_id}/messages",
            json={"role": "user", "content": "Delete me"},
        )
        self.client.post(
            f"/api/chat/conversations/{conversation_id}/messages",
            json={"role": "assistant", "content": "Deleted"},
        )

        deleted = self.client.delete(
            f"/api/chat/conversations/{conversation_id}"
        )
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertTrue(deleted.json()["success"])

        self.assertEqual(
            self.client.get(
                f"/api/chat/conversations/{conversation_id}"
            ).status_code,
            404,
        )

        db = get_db()
        try:
            self.assertEqual(
                db.query(Message)
                .filter(Message.conversation_id == conversation_id)
                .count(),
                0,
            )
            self.assertEqual(db.query(Conversation).count(), 0)
        finally:
            db.close()

    def test_missing_conversation_returns_404(self) -> None:
        self.assertEqual(
            self.client.get("/api/chat/conversations/missing").status_code,
            404,
        )
        self.assertEqual(
            self.client.post(
                "/api/chat/conversations/missing/messages",
                json={"role": "user", "content": "hi"},
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.patch(
                "/api/chat/conversations/missing",
                json={"title": "x"},
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.delete("/api/chat/conversations/missing").status_code,
            404,
        )

    # ------------------------------------------------------- chat persistence

    def test_non_streaming_chat_persists_both_messages(self) -> None:
        fake_chat = AsyncMock(
            return_value={
                "content": "Hello from the model",
                "usage": {"completion_tokens": 5},
                "model": "test-model",
            }
        )

        with patch("routes.chat.chat", new=fake_chat):
            response = self.client.post(
                "/api/chat",
                json={
                    "messages": [{"role": "user", "content": "Hello"}],
                    "temperature": 0.2,
                    "max_tokens": 32,
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["content"], "Hello from the model")
        self.assertIn("conversation_id", body)

        detail = self.client.get(
            f"/api/chat/conversations/{body['conversation_id']}"
        ).json()
        self.assertEqual(detail["title"], "Hello")
        self.assertEqual(
            [message["role"] for message in detail["messages"]],
            ["user", "assistant"],
        )
        self.assertEqual(
            [message["content"] for message in detail["messages"]],
            ["Hello", "Hello from the model"],
        )
        self.assertEqual(detail["messages"][1]["tokens"], 5)

    def test_streaming_chat_persists_both_messages(self) -> None:
        async def fake_stream(**_kwargs):
            yield {"content": "Hello"}
            yield {"content": " world"}
            yield {"done": True}

        with patch("chat_service.stream_chat", new=fake_stream):
            response = self.client.post(
                "/api/chat/stream",
                json={
                    "messages": [{"role": "user", "content": "Hello"}],
                    "temperature": 0.2,
                    "max_tokens": 32,
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn('"content": "Hello"', response.text)
        self.assertIn("[DONE]", response.text)

        conversation_id = response.headers["x-conversation-id"]
        detail = self.client.get(
            f"/api/chat/conversations/{conversation_id}"
        ).json()
        self.assertEqual(detail["title"], "Hello")
        self.assertEqual(
            [message["content"] for message in detail["messages"]],
            ["Hello", "Hello world"],
        )

    def test_cancelled_stream_persists_partial_response(self) -> None:
        async def fake_stream(**_kwargs):
            yield {"content": "Partial answer"}
            yield {"content": " that was cut off"}
            yield {"done": True}

        db = get_db()
        try:
            conversation = prepare_turn(
                db,
                conversation_id=None,
                messages=[{"role": "user", "content": "Tell me a story"}],
                model=None,
            )
            conversation_id = conversation.id
        finally:
            db.close()

        async def scenario() -> None:
            with patch("chat_service.stream_chat", new=fake_stream):
                generator = stream_and_persist(
                    messages=[{"role": "user", "content": "Tell me a story"}],
                    temperature=0.2,
                    max_tokens=64,
                    top_p=0.9,
                    conversation_id=conversation_id,
                )
                first = await generator.__anext__()
                self.assertIn("Partial answer", first)
                # Simulate the client disconnecting mid-stream.
                await generator.aclose()

        asyncio.run(scenario())

        detail = self.client.get(
            f"/api/chat/conversations/{conversation_id}"
        ).json()
        self.assertEqual(
            [message["content"] for message in detail["messages"]],
            ["Tell me a story", "Partial answer"],
        )

    def test_reload_returns_full_history(self) -> None:
        async def fake_stream(**_kwargs):
            yield {"content": "First reply"}
            yield {"done": True}

        with patch("chat_service.stream_chat", new=fake_stream):
            first = self.client.post(
                "/api/chat/stream",
                json={"messages": [{"role": "user", "content": "First"}]},
            )

        conversation_id = first.headers["x-conversation-id"]

        async def second_stream(**_kwargs):
            yield {"content": "Second reply"}
            yield {"done": True}

        with patch("chat_service.stream_chat", new=second_stream):
            self.client.post(
                "/api/chat/stream",
                json={
                    "messages": [
                        {"role": "user", "content": "First"},
                        {"role": "assistant", "content": "First reply"},
                        {"role": "user", "content": "Second"},
                    ],
                    "conversation_id": conversation_id,
                },
            )

        # This is exactly what the workspace does after a browser reload.
        detail = self.client.get(
            f"/api/chat/conversations/{conversation_id}"
        ).json()
        self.assertEqual(
            [message["content"] for message in detail["messages"]],
            ["First", "First reply", "Second", "Second reply"],
        )

    def test_new_chat_creates_separate_conversations(self) -> None:
        fake_chat = AsyncMock(
            side_effect=[
                {"content": "one", "usage": {}, "model": "m"},
                {"content": "two", "usage": {}, "model": "m"},
            ]
        )

        with patch("routes.chat.chat", new=fake_chat):
            first = self.client.post(
                "/api/chat",
                json={"messages": [{"role": "user", "content": "Chat one"}]},
            ).json()
            second = self.client.post(
                "/api/chat",
                json={"messages": [{"role": "user", "content": "Chat two"}]},
            ).json()

        self.assertNotEqual(first["conversation_id"], second["conversation_id"])

        db = get_db()
        try:
            self.assertEqual(db.query(Conversation).count(), 2)
            self.assertEqual(db.query(Message).count(), 4)
        finally:
            db.close()

    def test_regenerate_replaces_last_assistant_message(self) -> None:
        conversation = _create_conversation(self.client, title="Regenerate")
        conversation_id = conversation["id"]

        self.client.post(
            f"/api/chat/conversations/{conversation_id}/messages",
            json={"role": "user", "content": "Question"},
        )
        self.client.post(
            f"/api/chat/conversations/{conversation_id}/messages",
            json={"role": "assistant", "content": "Old answer"},
        )

        async def fake_stream(**_kwargs):
            yield {"content": "New answer"}
            yield {"done": True}

        with patch("chat_service.stream_chat", new=fake_stream):
            self.client.post(
                "/api/chat/stream",
                json={
                    "messages": [{"role": "user", "content": "Question"}],
                    "conversation_id": conversation_id,
                    "persist_user_message": False,
                    "replace_last_assistant": True,
                },
            )

        detail = self.client.get(
            f"/api/chat/conversations/{conversation_id}"
        ).json()
        self.assertEqual(
            [message["content"] for message in detail["messages"]],
            ["Question", "New answer"],
        )


if __name__ == "__main__":
    unittest.main()
