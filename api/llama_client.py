import os

import httpx

LLAMA_BASE_URL = os.getenv(
    "LLAMA_BASE_URL",
    "http://127.0.0.1:8080"
).rstrip("/")

TIMEOUT = httpx.Timeout(
    connect=5.0,
    read=300.0,
    write=30.0,
    pool=5.0,
)


async def check_health():
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.get(
            f"{LLAMA_BASE_URL}/health"
        )
        response.raise_for_status()
        return response.json()


async def list_models():
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.get(
            f"{LLAMA_BASE_URL}/v1/models"
        )
        response.raise_for_status()
        return response.json()


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
            f"{LLAMA_BASE_URL}/v1/chat/completions",
            json=payload,
        )
        response.raise_for_status()
        result = response.json()

    choices = result.get("choices", [])
    if not choices:
        raise RuntimeError("llama.cpp returned no chat choices")

    return {
        "content": choices[0]["message"]["content"],
        "usage": result.get("usage"),
        "model": result.get("model"),
    }


async def stream_chat(messages, temperature=0.2, max_tokens=512):
    """Async generator that streams chat completions from llama.cpp.

    Yields dicts with either {"content": "delta_text"} or {"error": "error_message"}.
    Recognizes [DONE] termination.
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
            f"{LLAMA_BASE_URL}/v1/chat/completions",
            json=payload,
        ) as response:
            response.raise_for_status()

            async for chunk in response.aiter_lines():
                chunk = chunk.strip()
                if not chunk:
                    continue

                if chunk == "[DONE]":
                    yield {"done": True}
                    break

                try:
                    import json
                    data = json.loads(chunk[6:]) if chunk.startswith("data: ") else json.loads(chunk)
                    delta = data.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content")
                    if content is not None:
                        yield {"content": content}
                    else:
                        yield {"content": ""}
                except (json.JSONDecodeError, KeyError, IndexError) as e:
                    # Skip malformed chunks but continue streaming
                    yield {"error": f"malformed_chunk: {str(e)}"}
                    continue