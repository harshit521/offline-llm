"""Async client for llama.cpp's OpenAI-compatible API.

The base URL is resolved dynamically: when the backend manages a
``llama-server`` process, that instance is used; otherwise the externally
supervised ``LLAMA_BASE_URL`` is used. This keeps the external-process
workflow working while enabling managed model loading.
"""

from __future__ import annotations

import json
import os

import httpx

EXTERNAL_LLAMA_BASE_URL = os.getenv(
    "LLAMA_BASE_URL", "http://127.0.0.1:8080"
).rstrip("/")

# Backwards-compatible alias for code that only needs the external default.
LLAMA_BASE_URL = EXTERNAL_LLAMA_BASE_URL

TIMEOUT = httpx.Timeout(
    connect=5.0,
    read=300.0,
    write=30.0,
    pool=5.0,
)

_runtime_base_url: str | None = None


def set_runtime_base_url(url: str | None) -> None:
    """Point chat traffic at a managed llama-server (or back to the fallback)."""
    global _runtime_base_url
    _runtime_base_url = url.rstrip("/") if url else None


def get_base_url() -> str:
    """Return the URL chat traffic should use right now."""
    return _runtime_base_url or EXTERNAL_LLAMA_BASE_URL


def is_managed() -> bool:
    return _runtime_base_url is not None


async def check_health():
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.get(f"{get_base_url()}/health")
        response.raise_for_status()
        return response.json()


async def list_models():
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.get(f"{get_base_url()}/v1/models")
        response.raise_for_status()
        return response.json()


def _message_text(message: dict) -> str:
    """Return visible text, falling back to reasoning output if necessary."""
    content = message.get("content")
    if content:
        return content
    reasoning = message.get("reasoning_content")
    if reasoning:
        return reasoning
    return ""


async def chat(messages, temperature=0.2, max_tokens=512):
    """Non-streaming chat completion."""
    payload = {
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.post(
            f"{get_base_url()}/v1/chat/completions",
            json=payload,
        )
        response.raise_for_status()
        result = response.json()

    choices = result.get("choices", [])
    if not choices:
        raise RuntimeError("llama.cpp returned no chat choices")

    return {
        "content": _message_text(choices[0].get("message", {})),
        "usage": result.get("usage"),
        "model": result.get("model"),
    }


async def stream_chat(messages, temperature=0.2, max_tokens=512):
    """Async generator that streams chat completions from llama.cpp.

    Yields dicts with either ``{"content": "delta_text"}``,
    ``{"done": True}``, or ``{"error": "..."}``.
    """
    payload = {
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        async with client.stream(
            "POST",
            f"{get_base_url()}/v1/chat/completions",
            json=payload,
        ) as response:
            response.raise_for_status()

            async for raw_line in response.aiter_lines():
                line = raw_line.strip()
                if not line:
                    continue

                if line.startswith("data:"):
                    data_str = line[5:].strip()
                else:
                    data_str = line

                if data_str == "[DONE]":
                    yield {"done": True}
                    break

                try:
                    data = json.loads(data_str)
                except json.JSONDecodeError as exc:
                    yield {"error": f"malformed_chunk: {exc}"}
                    continue

                try:
                    delta = data["choices"][0].get("delta", {})
                except (KeyError, IndexError, TypeError) as exc:
                    yield {"error": f"malformed_chunk: {exc}"}
                    continue

                content = delta.get("content")
                if content is None:
                    content = delta.get("reasoning_content")

                if content is not None:
                    yield {"content": content}
