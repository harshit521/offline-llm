import json
import uuid
from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field
import httpx

from llama_client import chat, stream_chat, get_base_url
from models import Conversation, Message, get_db
from runtime import runtime_manager

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    messages: list[dict] = Field(min_length=1)
    temperature: float = Field(default=0.2, ge=0, le=2)
    max_tokens: int = Field(default=512, ge=1, le=2048)
    model_id: str | None = Field(default=None, max_length=200)


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



@router.post("")
async def create_chat(request: ChatRequest):
    _ensure_model_ready(request.model_id)
    try:
        return await chat(
            messages=request.messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
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


@router.post("/stream")
async def create_chat_stream(request: ChatRequest):
    """Streaming chat endpoint that returns SSE events."""
    _ensure_model_ready(request.model_id)

    async def event_generator():
        async for chunk in stream_chat(
            messages=request.messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        ):
            if chunk.get("done"):
                yield f"data: [DONE]\n\n"
                break
            elif chunk.get("error"):
                yield f"data: {json.dumps({'error': chunk['error']})}\n\n"
            elif chunk.get("content") is not None:
                yield f"data: {json.dumps({'content': chunk['content']})}\n\n"

    from fastapi.responses import StreamingResponse

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/health")
async def health():
    """Check backend and llama-server status."""
    base_url = get_base_url()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            llama_health = await client.get(
                f"{base_url}/health"
            )
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
    async with httpx.AsyncClient(timeout=httpx.Timeout(
        connect=5.0,
        read=10.0,
        write=5.0,
        pool=5.0,
    )) as client:
        try:
            response = await client.get(
                f"{get_base_url()}/v1/models"
            )
            if response.status_code == 200:
                data = response.json()
                return {"data": data.get("data", [])}
            else:
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

CONVERSATION_ID_LENGTH = 50  # prefix length for generating titles


@router.get("/conversations", response_model=list)
async def list_conversations():
    """List all conversations."""
    db = get_db()
    try:
        conversations = db.query(Conversation).order_by(
            Conversation.updated_at.desc()
        ).all()
        return [
            {
                "id": c.id,
                "title": c.title,
                "model": c.model,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in conversations
        ]
    finally:
        db.close()


@router.post("/conversations", response_model=dict)
async def create_conversation(title: str = "New Conversation"):
    """Create a new conversation."""
    db = get_db()
    try:
        conv = Conversation(id="", title=title, model=None)
        # Generate a proper ID
        import uuid
        conv.id = str(uuid.uuid4())
        db.add(conv)
        db.commit()
        db.refresh(conv)
        return {
            "id": conv.id,
            "title": conv.title,
            "model": conv.model,
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        }
    finally:
        db.close()


@router.get("/conversations/{conversation_id}", response_model=dict)
async def get_conversation(
    conversation_id: str = Path(...),
):
    """Get a specific conversation by ID."""
    db = get_db()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        messages = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
            .all()
        )
        return {
            "id": conv.id,
            "title": conv.title,
            "model": conv.model,
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
            "messages": [
                {
                    "id": m.id,
                    "role": m.role,
                    "content": m.content,
                    "tokens": m.tokens,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in messages
            ],
        }
    finally:
        db.close()


@router.patch("/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str = Path(...),
    title: str = None,
):
    """Update a conversation title."""
    db = get_db()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if title is not None:
            conv.title = title
        db.commit()
        db.refresh(conv)
        return {
            "id": conv.id,
            "title": conv.title,
            "model": conv.model,
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        }
    finally:
        db.close()


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str = Path(...),
):
    """Delete a conversation and all its messages."""
    db = get_db()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        db.delete(conv)
        db.commit()
        return {"success": True, "deleted_id": conversation_id}
    finally:
        db.close()


@router.get("/conversations/{conversation_id}/messages", response_model=dict)
async def get_conversation_messages(
    conversation_id: str = Path(...),
):
    """Get all messages for a conversation."""
    db = get_db()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        messages = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
            .all()
        )
        return {
            "conversation_id": conv.id,
            "conversation_title": conv.title,
            "messages": [
                {
                    "id": m.id,
                    "role": m.role,
                    "content": m.content,
                    "tokens": m.tokens,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in messages
            ],
        }
    finally:
        db.close()