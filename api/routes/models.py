"""Model registry, download, and runtime lifecycle API."""

from __future__ import annotations

import asyncio
import json
import logging

import httpx
from fastapi import APIRouter, HTTPException, Path
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

import config
import llama_client
from downloads import (
    DownloadConflict,
    DownloadError,
    InvalidDownload,
    download_manager,
)
from models import ModelRecord, get_db
from registry import (
    DuplicateModel,
    InvalidModelFile,
    create_model_record,
    resolve_model_path,
    serialize_model,
)
from runtime import (
    ModelRuntimeError,
    RuntimeConflict,
    RuntimeUnavailable,
    runtime_manager,
)

logger = logging.getLogger("offline_llm.models_api")

router = APIRouter(prefix="/api/models", tags=["models"])


class RegisterModelRequest(BaseModel):
    path: str = Field(min_length=1, max_length=4096)
    name: str | None = Field(default=None, max_length=200)
    context: int | None = Field(
        default=None, ge=256, le=config.MAX_MODEL_CONTEXT
    )


class DownloadModelRequest(BaseModel):
    repo_id: str = Field(min_length=3, max_length=300)
    filename: str = Field(min_length=5, max_length=500)
    context: int | None = Field(
        default=None, ge=256, le=config.MAX_MODEL_CONTEXT
    )


def _context_or_default(value: int | None) -> int:
    return value if value is not None else config.DEFAULT_MODEL_CONTEXT


def _get_model(db, model_id: str) -> ModelRecord:
    record = db.query(ModelRecord).filter(ModelRecord.id == model_id).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Model not found.")
    return record


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.get("")
async def list_models():
    """Return every registered model, annotated with runtime state."""
    runtime = runtime_manager.snapshot()
    db = get_db()
    try:
        records = (
            db.query(ModelRecord)
            .order_by(ModelRecord.created_at.desc())
            .all()
        )
        return [serialize_model(record, runtime) for record in records]
    except SQLAlchemyError:
        logger.exception("Failed to list registered models")
        raise HTTPException(
            status_code=500, detail="Could not read the model registry."
        )
    finally:
        db.close()


@router.post("", status_code=201)
async def register_model(request: RegisterModelRequest):
    """Register an existing GGUF file that lives in the models directory."""
    db = get_db()
    try:
        try:
            record = create_model_record(
                db,
                request.path,
                name=request.name,
                context=_context_or_default(request.context),
            )
        except InvalidModelFile as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except DuplicateModel as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        return serialize_model(record, runtime_manager.snapshot())
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to register model")
        raise HTTPException(status_code=500, detail="Could not register the model.")
    finally:
        db.close()


@router.post("/download")
async def download_model(request: DownloadModelRequest):
    """Start a Hugging Face download and stream progress as SSE."""
    try:
        job = await download_manager.start(
            request.repo_id,
            request.filename,
            _context_or_default(request.context),
        )
    except InvalidDownload as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DownloadConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except DownloadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    async def progress_events():
        while True:
            current = download_manager.get(job.id)
            if current is None:
                yield _sse(
                    {"id": job.id, "status": "failed", "error": "Download job disappeared."}
                )
                return

            payload = current.to_dict()
            yield _sse(payload)

            if payload["status"] in {"completed", "failed", "cancelled"}:
                return

            await asyncio.sleep(0.3)

    return StreamingResponse(
        progress_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/downloads")
async def list_downloads():
    """List download jobs (useful for debugging and reconnect support)."""
    return download_manager.list_jobs()


@router.get("/downloads/{job_id}")
async def get_download(job_id: str = Path(..., min_length=1)):
    job = download_manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Download job not found.")
    return job.to_dict()


@router.get("/runtime")
async def runtime_status():
    """Return the managed runtime state plus external-server reachability."""
    snapshot = runtime_manager.snapshot()

    reachable = snapshot["status"] == "running"
    if not reachable:
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                response = await client.get(
                    f"{config.EXTERNAL_LLAMA_BASE_URL}/health"
                )
                reachable = response.status_code == 200
        except httpx.HTTPError:
            reachable = False

    snapshot["reachable"] = reachable
    snapshot["active_base_url"] = llama_client.get_base_url()
    snapshot["models_dir"] = str(config.MODELS_DIR)
    return snapshot


@router.post("/{model_id}/load")
async def load_model(model_id: str = Path(..., min_length=1)):
    """Start a managed llama-server for the selected model."""
    db = get_db()
    try:
        record = _get_model(db, model_id)
        payload = {
            "model_id": record.id,
            "name": record.name,
            "path": record.path,
            "quant": record.quant,
            "context": record.context,
        }
    finally:
        db.close()

    try:
        return await runtime_manager.load(**payload)
    except RuntimeConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RuntimeUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ModelRuntimeError as exc:
        logger.exception("Failed to load model %s", model_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/{model_id}/unload")
async def unload_model(model_id: str = Path(..., min_length=1)):
    """Stop the managed llama-server for this model (idempotent)."""
    db = get_db()
    try:
        _get_model(db, model_id)
    finally:
        db.close()

    try:
        return await runtime_manager.unload(model_id)
    except RuntimeConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/{model_id}")
async def delete_model(model_id: str = Path(..., min_length=1)):
    """Remove a model from the registry and delete its GGUF file."""
    runtime = runtime_manager.snapshot()
    if runtime.get("model_id") == model_id and runtime.get("status") in {
        "running",
        "starting",
    }:
        raise HTTPException(
            status_code=409,
            detail="Unload the model before deleting it.",
        )

    db = get_db()
    try:
        record = _get_model(db, model_id)
        file_path = resolve_model_path(record.path)
        file_removed = False

        if file_path.exists():
            try:
                file_path.unlink()
                file_removed = True
            except OSError as exc:
                logger.exception("Failed to delete model file %s", file_path)
                raise HTTPException(
                    status_code=500,
                    detail="Could not delete the model file from disk.",
                ) from exc

        db.delete(record)
        db.commit()
        return {
            "success": True,
            "deleted_id": model_id,
            "file_removed": file_removed,
        }
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to delete model %s", model_id)
        raise HTTPException(status_code=500, detail="Could not delete the model.")
    finally:
        db.close()
