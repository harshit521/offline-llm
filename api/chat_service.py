"""Chat generation helpers that persist the assistant turn.

The streaming helper owns only the generation/persistence lifecycle; the route
is responsible for creating the conversation and persisting the user message
before this generator starts.
"""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from conversations import save_assistant_message
from llama_client import stream_chat

logger = logging.getLogger("offline_llm.chat_service")


async def stream_and_persist(
    *,
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    top_p: float,
    conversation_id: str,
    replace_message_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Yield SSE events and persist whatever assistant text was generated.

    The ``finally`` block covers normal completion, upstream errors, client
    disconnects, and cancellation, so a stopped response still keeps its
    partial text.
    """
    chunks: list[str] = []

    try:
        async for chunk in stream_chat(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
        ):
            if chunk.get("done"):
                yield "data: [DONE]\n\n"
                break

            if chunk.get("error"):
                yield f"data: {json.dumps({'error': chunk['error']})}\n\n"
                continue

            content = chunk.get("content")
            if content is not None:
                chunks.append(content)
                yield f"data: {json.dumps({'content': content})}\n\n"
    finally:
        text = "".join(chunks)
        if text:
            save_assistant_message(
                conversation_id,
                text,
                replace_message_id=replace_message_id,
            )
