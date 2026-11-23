"""Persistence helpers for conversations and their messages.

The chat endpoints call :func:`prepare_turn` before inference and
:func:`save_assistant_message` once generation finishes (or is cancelled).
Keeping these operations here means the streaming route never holds a database
session open for the lifetime of a response.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy.orm import Session

from models import Conversation, Message, get_db

logger = logging.getLogger("offline_llm.conversations")

DEFAULT_TITLE = "New Conversation"
TITLE_MAX_LENGTH = 60
PREVIEW_MAX_LENGTH = 120


class ConversationNotFound(Exception):
    """The requested conversation id does not exist."""


class AssistantMessageNotFound(Exception):
    """The assistant turn requested for regeneration does not exist."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _clean_text(text: str) -> str:
    return " ".join((text or "").split())


def derive_title(text: str) -> str:
    """Build a short conversation title from the first user message."""
    cleaned = _clean_text(text)
    if not cleaned:
        return DEFAULT_TITLE
    if len(cleaned) <= TITLE_MAX_LENGTH:
        return cleaned
    return cleaned[: TITLE_MAX_LENGTH - 1].rstrip() + "…"


def derive_preview(text: str) -> str:
    cleaned = _clean_text(text)
    if len(cleaned) <= PREVIEW_MAX_LENGTH:
        return cleaned
    return cleaned[: PREVIEW_MAX_LENGTH - 1].rstrip() + "…"


def serialize_message(message: Message) -> dict:
    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "role": message.role,
        "content": message.content,
        "tokens": int(message.tokens or 0),
        "created_at": _iso(message.created_at),
    }


def serialize_conversation(
    conversation: Conversation,
    *,
    messages: Iterable[Message] | None = None,
    message_count: int | None = None,
    preview: str | None = None,
    include_messages: bool = False,
) -> dict:
    data = {
        "id": conversation.id,
        "title": conversation.title,
        "model": conversation.model,
        "created_at": _iso(conversation.created_at),
        "updated_at": _iso(conversation.updated_at),
        "message_count": (
            message_count
            if message_count is not None
            else (len(list(messages)) if messages is not None else 0)
        ),
        "preview": preview or "",
    }
    if include_messages:
        data["messages"] = [serialize_message(message) for message in (messages or [])]
    return data


def create_conversation(
    db: Session,
    *,
    title: str | None = None,
    model: str | None = None,
) -> Conversation:
    now = _now()
    conversation = Conversation(
        id=str(uuid.uuid4()),
        title=(title or "").strip() or DEFAULT_TITLE,
        model=model,
        created_at=now,
        updated_at=now,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def get_conversation(db: Session, conversation_id: str) -> Conversation:
    conversation = (
        db.query(Conversation).filter(Conversation.id == conversation_id).first()
    )
    if conversation is None:
        raise ConversationNotFound("Conversation not found.")
    return conversation


def list_conversation_messages(db: Session, conversation_id: str) -> list[Message]:
    return (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )


def add_message(
    db: Session,
    conversation: Conversation,
    *,
    role: str,
    content: str,
    tokens: int | None = None,
    commit: bool = True,
) -> Message:
    now = _now()
    message = Message(
        id=str(uuid.uuid4()),
        conversation_id=conversation.id,
        role=role,
        content=content,
        tokens=tokens or 0,
        created_at=now,
    )
    conversation.updated_at = now
    db.add(message)
    if commit:
        db.commit()
        db.refresh(message)
    return message


def resolve_assistant_message(
    db: Session,
    conversation: Conversation,
    assistant_index: int,
) -> Message:
    """Return the assistant message at ``assistant_index`` (0-based, oldest first).

    Regeneration targets a specific visible turn, not whichever assistant
    message happens to be newest, so the client sends the ordinal of the clicked
    answer among the conversation's assistant messages.
    """
    assistants = (
        db.query(Message)
        .filter(
            Message.conversation_id == conversation.id,
            Message.role == "assistant",
        )
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )
    if assistant_index < 0 or assistant_index >= len(assistants):
        raise AssistantMessageNotFound("Assistant message not found.")
    return assistants[assistant_index]


def prepare_turn(
    db: Session,
    *,
    conversation_id: str | None,
    messages: list[dict],
    model: str | None,
    persist_user_message: bool = True,
    replace_assistant_index: int | None = None,
) -> tuple[Conversation, str | None]:
    """Create/resolve a conversation and persist the incoming user turn.

    Only the final message in ``messages`` is written, because clients send the
    whole history on every request. Callers should pass
    ``persist_user_message=False`` when regenerating a response.

    When ``replace_assistant_index`` is set the matching assistant message is
    resolved and its id is returned so the generated text can be written back in
    place, preserving the surrounding history and its order.
    """
    if conversation_id:
        conversation = get_conversation(db, conversation_id)
        if model and not conversation.model:
            conversation.model = model
    else:
        conversation = create_conversation(db, model=model)

    target_message_id: str | None = None
    if replace_assistant_index is not None:
        target_message_id = resolve_assistant_message(
            db, conversation, replace_assistant_index
        ).id

    last = messages[-1] if messages else None
    user_text = ""
    if last and last.get("role") == "user":
        user_text = str(last.get("content") or "")

    if persist_user_message and user_text:
        if conversation.title in {DEFAULT_TITLE, ""}:
            conversation.title = derive_title(user_text)
        add_message(
            db,
            conversation,
            role="user",
            content=user_text,
            commit=False,
        )

    conversation.updated_at = _now()
    db.commit()
    db.refresh(conversation)
    return conversation, target_message_id


def save_assistant_message(
    conversation_id: str,
    content: str,
    *,
    tokens: int | None = None,
    replace_message_id: str | None = None,
) -> dict | None:
    """Persist an assistant response in its own short-lived session.

    ``replace_message_id`` updates an existing assistant turn in place, which
    keeps the conversation order intact when regenerating an older answer.
    """
    if not content:
        return None

    db = get_db()
    try:
        conversation = (
            db.query(Conversation)
            .filter(Conversation.id == conversation_id)
            .first()
        )
        if conversation is None:
            logger.warning(
                "Dropping assistant message for missing conversation %s",
                conversation_id,
            )
            return None

        if replace_message_id:
            message = (
                db.query(Message)
                .filter(
                    Message.id == replace_message_id,
                    Message.conversation_id == conversation_id,
                )
                .first()
            )
            if message is None:
                logger.warning(
                    "Cannot regenerate missing assistant message %s",
                    replace_message_id,
                )
                return None
            message.content = content
            message.tokens = tokens or 0
            conversation.updated_at = _now()
            db.commit()
            db.refresh(message)
            return serialize_message(message)

        message = add_message(
            db,
            conversation,
            role="assistant",
            content=content,
            tokens=tokens,
        )
        return serialize_message(message)
    except Exception:  # pragma: no cover - persistence must not break streaming
        db.rollback()
        logger.exception("Failed to persist assistant message")
        return None
    finally:
        db.close()
