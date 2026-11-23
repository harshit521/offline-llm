import json
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Path
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

import config
from chat_service import stream_and_persist
from conversations import (
    DEFAULT_TITLE,
    ConversationNotFound,
    add_message,
    create_conversation,
    derive_preview,
    derive_title,
    get_conversation,
    list_conversation_messages,
    prepare_turn,
    save_assistant_message,
    serialize_conversation,
    serialize_message,
)
from llama_client import chat, get_base_url
from models import Conversation, Message, get_db
from runtime import runtime_manager

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    messages: list[dict] = Field(min_length=1)
    temperature: float = Field(default=0.2, ge=0, le=2)
    max_tokens: int = Field(default=512, ge=1, le=config.MAX_CHAT_TOKENS)
    top_p: float = Field(default=0.9, ge=0, le=1)
    model_id: str | None = Field(default=None, max_length=200)
    conversation_id: str | None = Field(default=None, max_length=200)
    # Regenerate keeps the existing user message and replaces the last answer.
    persist_user_message: bool = True
    replace_last_assistant: bool = False


class ConversationCreateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    model: str | None = Field(default=None, max_length=200)


class ConversationUpdateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class MessageCreateRequest(BaseModel):
    role: Literal["user", "assistant", "system"] = "user"
    content: str = Field(min_length=1)
    tokens: int | None = Field(default=None, ge=0)


def _ensure_model_ready(model_id: str | None) -> None:
    """Reject requests that target a model other than the managed runtime.

    When no managed runtime is active the request is forwarded to the
    externally supervised llama-server, preserving the pre-Phase-3 setup.
    """
    if not model_id:
        return

    snapshot = runtime_manager.snapshot()
    status = snapshot.get("status")

    if status in {"starting", "stopping"}:
        raise HTTPException(
            status_code=409,
            detail="A model is starting or stopping. Try again shortly.",
        )

    loaded_id = snapshot.get("model_id")
    if status == "running" and loaded_id and loaded_id != model_id:
        raise HTTPException(
            status_code=409,
            detail="The selected model is not loaded. Load it in the Models page first.",
        )


def _open_turn(request: ChatRequest) -> tuple[str, str]:
    """Create/resolve the conversation and persist the user message."""
    db = get_db()
    try:
        conversation = prepare_turn(
            db,
            conversation_id=request.conversation_id,
            messages=request.messages,
            model=request.model_id,
            persist_user_message=request.persist_user_message,
            replace_last_assistant=request.replace_last_assistant,
        )
        return conversation.id, conversation.title
    except ConversationNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Could not save the conversation."
        ) from exc
    finally:
        db.close()


@router.post("")
async def create_chat(request: ChatRequest):
    _ensure_model_ready(request.model_id)
    conversation_id, title = _open_turn(request)

    try:
        result = await chat(
            messages=request.messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            top_p=request.top_p,
        )
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"llama.cpp returned HTTP {exc.response.status_code}",
        ) from exc
    except (httpx.HTTPError, RuntimeError) as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Unable to generate a response: {exc}",
        ) from exc

    usage = result.get("usage") or {}
    save_assistant_message(
        conversation_id,
        result.get("content") or "",
        tokens=usage.get("completion_tokens"),
    )

    result["conversation_id"] = conversation_id
    result["conversation_title"] = title
    return result


@router.post("/stream")
async def create_chat_stream(request: ChatRequest):
    """Streaming chat endpoint that returns SSE events."""
    _ensure_model_ready(request.model_id)
    conversation_id, _ = _open_turn(request)

    return StreamingResponse(
        stream_and_persist(
            messages=request.messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            top_p=request.top_p,
            conversation_id=conversation_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Conversation-Id": conversation_id,
        },
    )


@router.get("/health")
async def health():
    """Check backend and llama-server status."""
    base_url = get_base_url()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            llama_health = await client.get(f"{base_url}/health")
            llama_ok = llama_health.status_code == 200
    except Exception:
        llama_ok = False

    return {
        "status": "ok" if llama_ok else "unavailable",
        "llama_server_reachable": llama_ok,
        "llama_base_url": base_url,
        "managed_runtime": runtime_manager.snapshot().get("status") == "running",
        "service": "offline-llm-api",
    }


@router.get("/models")
async def list_models():
    """List models from the active llama.cpp server.

    Kept for backwards compatibility. The Phase 3 registry lives at
    ``GET /api/models``.
    """
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=5.0,
            read=10.0,
            write=5.0,
            pool=5.0,
        )
    ) as client:
        try:
            response = await client.get(f"{get_base_url()}/v1/models")
            if response.status_code == 200:
                data = response.json()
                return {"data": data.get("data", [])}
            raise HTTPException(
                status_code=502,
                detail=f"llama.cpp returned HTTP {response.status_code}",
            )
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Unable to fetch models: {exc}",
            ) from exc


# --- Conversation API endpoints ---


@router.get("/conversations")
async def list_conversations():
    """List conversations with a message count and last-message preview."""
    db = get_db()
    try:
        conversations = (
            db.query(Conversation)
            .order_by(Conversation.updated_at.desc())
            .all()
        )

        messages_by_conversation: dict[str, list[Message]] = {}
        if conversations:
            ids = [conversation.id for conversation in conversations]
            rows = (
                db.query(Message)
                .filter(Message.conversation_id.in_(ids))
                .order_by(Message.created_at.asc(), Message.id.asc())
                .all()
            )
            for message in rows:
                messages_by_conversation.setdefault(
                    message.conversation_id, []
                ).append(message)

        result = []
        for conversation in conversations:
            messages = messages_by_conversation.get(conversation.id, [])
            result.append(
                serialize_conversation(
                    conversation,
                    message_count=len(messages),
                    preview=derive_preview(messages[-1].content) if messages else "",
                )
            )
        return result
    finally:
        db.close()


@router.post("/conversations", status_code=201)
async def create_conversation_endpoint(request: ConversationCreateRequest):
    """Create a conversation. Title is optional and can be set later."""
    db = get_db()
    try:
        conversation = create_conversation(
            db,
            title=request.title,
            model=request.model,
        )
        return serialize_conversation(conversation)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Could not create the conversation."
        ) from exc
    finally:
        db.close()


@router.get("/conversations/{conversation_id}")
async def get_conversation_endpoint(conversation_id: str = Path(...)):
    """Return one conversation together with its ordered messages."""
    db = get_db()
    try:
        conversation = get_conversation(db, conversation_id)
        messages = list_conversation_messages(db, conversation_id)
        return serialize_conversation(
            conversation,
            messages=messages,
            message_count=len(messages),
            preview=derive_preview(messages[-1].content) if messages else "",
            include_messages=True,
        )
    except ConversationNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    finally:
        db.close()


@router.patch("/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str = Path(...),
    request: ConversationUpdateRequest = ...,
):
    """Rename a conversation."""
    title = " ".join(request.title.split())
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty.")

    db = get_db()
    try:
        conversation = get_conversation(db, conversation_id)
        conversation.title = title
        db.commit()
        db.refresh(conversation)
        return serialize_conversation(conversation)
    except ConversationNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Could not rename the conversation."
        ) from exc
    finally:
        db.close()


@router.delete("/conversations")
async def delete_all_conversations():
    """Delete every conversation and message (Settings → Clear chat history)."""
    db = get_db()
    try:
        deleted = db.query(Conversation).count()
        # Delete messages first because SQLite foreign keys are not enforced.
        db.query(Message).delete(synchronize_session=False)
        db.query(Conversation).delete(synchronize_session=False)
        db.commit()
        return {"success": True, "deleted": deleted}
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Could not clear the conversation history."
        ) from exc
    finally:
        db.close()


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str = Path(...)):
    """Delete a conversation and all of its messages."""
    db = get_db()
    try:
        conversation = get_conversation(db, conversation_id)
        db.delete(conversation)
        db.commit()
        return {"success": True, "deleted_id": conversation_id}
    except ConversationNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Could not delete the conversation."
        ) from exc
    finally:
        db.close()


@router.post("/conversations/{conversation_id}/messages", status_code=201)
async def add_conversation_message(
    conversation_id: str = Path(...),
    request: MessageCreateRequest = ...,
):
    """Append a message to a conversation using a JSON body."""
    db = get_db()
    try:
        conversation = get_conversation(db, conversation_id)

        if (
            request.role == "user"
            and conversation.title in {DEFAULT_TITLE, ""}
        ):
            conversation.title = derive_title(request.content)

        message = add_message(
            db,
            conversation,
            role=request.role,
            content=request.content,
            tokens=request.tokens,
        )
        return serialize_message(message)
    except ConversationNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Could not add the message."
        ) from exc
    finally:
        db.close()


@router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: str = Path(...)):
    """Get all messages for a conversation."""
    db = get_db()
    try:
        conversation = get_conversation(db, conversation_id)
        messages = list_conversation_messages(db, conversation_id)
        return {
            "conversation_id": conversation.id,
            "conversation_title": conversation.title,
            "messages": [serialize_message(message) for message in messages],
        }
    except ConversationNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    finally:
        db.close()
