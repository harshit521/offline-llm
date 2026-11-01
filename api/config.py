"""Central configuration for the Offline LLM backend.

Every path and runtime knob can be overridden with an environment variable so
the API can run in development, tests, or a packaged install without code
changes. Values are read once at import time.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

# Load api/.env without overriding variables that are already set by the
# process (this keeps tests and systemd-style deployments in control).
load_dotenv(BASE_DIR / ".env", override=False)


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer, got {raw!r}") from exc


def _optional_int(name: str) -> int | None:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return None
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer, got {raw!r}") from exc


def _path(name: str, default: Path) -> Path:
    raw = os.getenv(name)
    candidate = Path(raw).expanduser() if raw else default
    return candidate.resolve()


# --- Storage ---------------------------------------------------------------

# Database URL. Defaults to the SQLite file used since Phase 2. Tests point
# this at a temporary file.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{(BASE_DIR / 'database.sqlite').as_posix()}",
)

# Where downloaded / registered GGUF files live.
MODELS_DIR = _path("MODELS_DIR", BASE_DIR / "models")

# llama-server stdout/stderr logs for managed instances.
MODEL_LOG_DIR = _path("MODEL_LOG_DIR", BASE_DIR / "logs")

# --- llama.cpp -------------------------------------------------------------

# Optional externally supervised llama-server. Used only when no managed
# runtime is active, so an existing `llama-server` setup keeps working.
EXTERNAL_LLAMA_BASE_URL = os.getenv(
    "LLAMA_BASE_URL", "http://127.0.0.1:8080"
).rstrip("/")

# Binary used for managed instances. Resolved with shutil.which at load time.
LLAMA_SERVER_BIN = os.getenv("LLAMA_SERVER_BIN", "llama-server")

# Port range used when the backend starts a managed llama-server.
MODEL_PORT_START = _int("MODEL_PORT_START", 8081)
MODEL_PORT_END = _int("MODEL_PORT_END", 8181)

# Seconds to wait for /health to report ready after spawning llama-server.
MODEL_LOAD_TIMEOUT = _int("MODEL_LOAD_TIMEOUT", 180)
# Seconds to wait for a graceful SIGTERM before sending SIGKILL.
MODEL_STOP_TIMEOUT = _int("MODEL_STOP_TIMEOUT", 15)

# Context window applied when a model is registered/downloaded and when the
# managed server is launched. Individual models may override this.
DEFAULT_MODEL_CONTEXT = _int("DEFAULT_MODEL_CONTEXT", 4096)
MAX_MODEL_CONTEXT = _int("MAX_MODEL_CONTEXT", 131072)

# Optional runtime tuning passed through to llama-server.
MODEL_GPU_LAYERS = _optional_int("MODEL_GPU_LAYERS")
MODEL_THREADS = _optional_int("MODEL_THREADS")

# Reasoning models (e.g. Qwen3.5) can spend the whole token budget "thinking"
# before emitting an answer. Default to off for a predictable chat UI; set to
# "on" or "auto" to keep the model's native behaviour.
MODEL_REASONING = os.getenv("MODEL_REASONING", "off").strip().lower()
if MODEL_REASONING not in {"on", "off", "auto"}:
    raise ValueError("MODEL_REASONING must be one of: on, off, auto")

# --- Hugging Face downloads ------------------------------------------------

HF_ENDPOINT = os.getenv("HF_ENDPOINT", "https://huggingface.co").rstrip("/")
DOWNLOAD_CHUNK_SIZE = _int("DOWNLOAD_CHUNK_SIZE", 1024 * 1024)
DOWNLOAD_TIMEOUT = _int("DOWNLOAD_TIMEOUT", 60)

# --- Misc ------------------------------------------------------------------

def ensure_directories() -> None:
    """Create storage directories if they do not exist yet."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_LOG_DIR.mkdir(parents=True, exist_ok=True)
