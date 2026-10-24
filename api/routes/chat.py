
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import httpx

from llama_client import chat

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
