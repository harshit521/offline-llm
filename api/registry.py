"""Helpers for validating, registering, and serializing GGUF models."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from config import MODELS_DIR
from models import ModelRecord

GGUF_MAGIC = b"GGUF"

# Matches Q4_K_M, Q8_0, IQ3_XS, F16, BF16, ... inside a filename.
_QUANT_RE = re.compile(
    r"(?:^|[-_.])((?:I?Q\d+(?:_[A-Z0-9]+)*)|BF16|F16|F32)(?:[-_.]|$)",
    re.IGNORECASE,
)


class RegistryError(Exception):
    """Base class for expected registry failures."""


class InvalidModelFile(RegistryError):
    """The file is missing, not a GGUF, or outside the models directory."""


class DuplicateModel(RegistryError):
    """A model with the same path is already registered."""


def resolve_model_path(candidate: str | Path) -> Path:
    """Resolve ``candidate`` and ensure it stays inside MODELS_DIR.

    Relative paths are interpreted relative to MODELS_DIR. Absolute paths are
    allowed only when they resolve inside MODELS_DIR. This blocks path
    traversal (``../``) and symlink escapes.
    """
    base = MODELS_DIR.resolve()
    raw = Path(candidate).expanduser()

    if not raw.is_absolute():
        raw = base / raw

    resolved = raw.resolve()

    if resolved != base and base not in resolved.parents:
        raise InvalidModelFile(
            "Model path must be inside the configured models directory."
        )

    return resolved


def validate_gguf_file(path: Path, *, require_extension: bool = True) -> None:
    """Validate extension, existence, size, and GGUF magic bytes.

    ``require_extension`` is disabled while checking an in-progress
    ``.part`` download, which still has the temporary suffix.
    """
    if require_extension and path.suffix.lower() != ".gguf":
        raise InvalidModelFile("Only .gguf files can be registered.")
    if not path.exists():
        raise InvalidModelFile("Model file does not exist.")
    if not path.is_file():
        raise InvalidModelFile("Model path is not a regular file.")
    if path.stat().st_size <= 0:
        raise InvalidModelFile("Model file is empty.")

    with path.open("rb") as handle:
        magic = handle.read(4)
    if magic != GGUF_MAGIC:
        raise InvalidModelFile("File is not a valid GGUF model (bad magic bytes).")


def detect_quant(filename: str) -> str:
    """Best-effort quantization detection from a filename."""
    match = _QUANT_RE.search(Path(filename).name)
    return match.group(1).upper() if match else "UNKNOWN"


def create_model_record(
    db: Session,
    path: Path,
    *,
    name: str | None = None,
    context: int,
) -> ModelRecord:
    """Insert a validated file into the registry and return the record."""
    resolved = resolve_model_path(path)
    validate_gguf_file(resolved)

    existing = db.query(ModelRecord).filter(ModelRecord.path == str(resolved)).first()
    if existing is not None:
        raise DuplicateModel("This model file is already registered.")

    record = ModelRecord(
        id=str(uuid.uuid4()),
        name=(name or resolved.stem).strip() or resolved.stem,
        path=str(resolved),
        quant=detect_quant(resolved.name),
        size=resolved.stat().st_size,
        context=context,
        created_at=datetime.now(timezone.utc),
    )

    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def serialize_model(record: ModelRecord, runtime: dict | None = None) -> dict:
    """Convert a registry row into a JSON-safe dict, annotating runtime state."""
    loaded = bool(
        runtime
        and runtime.get("status") == "running"
        and runtime.get("model_id") == record.id
    )

    return {
        "id": record.id,
        "name": record.name,
        "path": record.path,
        "quant": record.quant,
        "size": int(record.size or 0),
        "context": int(record.context or 0),
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "loaded": loaded,
        "status": "loaded" if loaded else "available",
    }
