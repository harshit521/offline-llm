import json
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import httpx

from llama_client import chat, stream_chat, LLAMA_BASE_URL

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    messages: list[dict] = Field(min_length=1)
    temperature: float = Field(default=0.2, ge=0, le=2)
    max_tokens: int = Field(default=512, ge=1, le=2048)


@router.post("")
async def create_chat(request: ChatRequest):
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
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            llama_health = await client.get(
                f"{LLAMA_BASE_URL}/health"
            )
            llama_ok = llama_health.status_code == 200
    except Exception:
        llama_ok = False

    return {
        "status": "ok" if llama_ok else "unavailable",
        "llama_server_reachable": llama_ok,
        "service": "offline-llm-api",
    }


@router.get("/models")
async def list_models():
    """List models from the configured llama.cpp server."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(
        connect=5.0,
        read=10.0,
        write=5.0,
        pool=5.0,
    )) as client:
        try:
            response = await client.get(
                f"{LLAMA_BASE_URL}/v1/models"
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