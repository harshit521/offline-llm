"""Hugging Face GGUF download jobs with progress tracking.

Downloads run as background asyncio tasks so progress survives a client
disconnect. Progress is exposed both as an SSE stream (POST /api/models/download)
and as a pollable job endpoint.
"""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import quote

import httpx

import config
from models import ModelRecord, get_db
from registry import (
    DuplicateModel,
    InvalidModelFile,
    create_model_record,
    resolve_model_path,
    validate_gguf_file,
)

logger = logging.getLogger("offline_llm.downloads")

_REPO_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$")

TERMINAL_STATUSES = {"completed", "failed", "cancelled"}


class DownloadError(Exception):
    """Base class for expected download failures."""


class InvalidDownload(DownloadError):
    """The requested repository or filename is not acceptable."""


class DownloadConflict(DownloadError):
    """The same file is already being downloaded or registered."""


@dataclass
class DownloadJob:
    id: str
    repo_id: str
    filename: str
    context: int
    status: str = "queued"
    downloaded: int = 0
    total: int | None = None
    percent: float | None = 0.0
    error: str | None = None
    model_id: str | None = None
    path: str | None = None
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def validate_request(repo_id: str, filename: str) -> None:
    """Validate a Hugging Face repo id and a safe relative GGUF filename."""
    repo_id = repo_id.strip()
    if not _REPO_ID_RE.match(repo_id):
        raise InvalidDownload(
            "Repository must look like 'owner/repository' (letters, numbers, '.', '_', '-')."
        )

    if not filename or filename.strip() != filename:
        raise InvalidDownload("A GGUF filename is required.")

    pure = PurePosixPath(filename)
    if pure.is_absolute() or ".." in pure.parts or "\\" in filename:
        raise InvalidDownload("Filename must be a safe relative path.")
    if pure.suffix.lower() != ".gguf":
        raise InvalidDownload("Only .gguf files can be downloaded.")

    # Resolve before starting so traversal is rejected up front.
    resolve_model_path(pure)


class DownloadManager:
    def __init__(self) -> None:
        self._jobs: dict[str, DownloadJob] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------ query

    def get(self, job_id: str) -> DownloadJob | None:
        return self._jobs.get(job_id)

    def list_jobs(self) -> list[dict[str, Any]]:
        jobs = sorted(self._jobs.values(), key=lambda job: job.created_at, reverse=True)
        return [job.to_dict() for job in jobs]

    # ------------------------------------------------------------------ start

    async def start(
        self, repo_id: str, filename: str, context: int
    ) -> DownloadJob:
        repo_id = repo_id.strip()
        filename = filename.strip()
        validate_request(repo_id, filename)

        target = resolve_model_path(filename)

        async with self._lock:
            for job in self._jobs.values():
                if job.status in TERMINAL_STATUSES:
                    continue
                if job.repo_id == repo_id and job.filename == filename:
                    raise DownloadConflict(
                        "This file is already being downloaded."
                    )
                if resolve_model_path(job.filename) == target:
                    raise DownloadConflict(
                        "Another download is already writing this file."
                    )

            db = get_db()
            try:
                existing = (
                    db.query(ModelRecord)
                    .filter(ModelRecord.path == str(target))
                    .first()
                )
            finally:
                db.close()
            if existing is not None:
                raise DownloadConflict("This model is already registered.")

            if target.exists():
                raise DownloadConflict(
                    "A file with this name already exists in the models directory. "
                    "Register it instead of downloading it again."
                )

            job = DownloadJob(
                id=str(uuid.uuid4()),
                repo_id=repo_id,
                filename=filename,
                context=context,
                created_at=_now(),
                updated_at=_now(),
            )
            self._jobs[job.id] = job
            self._tasks[job.id] = asyncio.create_task(self._run(job))
            return job

    # -------------------------------------------------------------------- run

    async def _run(self, job: DownloadJob) -> None:
        target = resolve_model_path(job.filename)
        part = target.with_name(target.name + ".part")
        target_existed = target.exists()

        job.status = "downloading"
        job.updated_at = _now()

        url = f"{config.HF_ENDPOINT}/{job.repo_id}/resolve/main/{quote(job.filename, safe='/')}"
        timeout = httpx.Timeout(
            connect=30.0,
            read=config.DOWNLOAD_TIMEOUT,
            write=30.0,
            pool=30.0,
        )

        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            if part.exists():
                part.unlink()

            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                async with client.stream("GET", url) as response:
                    if response.status_code != 200:
                        raise DownloadError(
                            f"Hugging Face returned HTTP {response.status_code}."
                        )

                    raw_total = (
                        response.headers.get("content-length")
                        or response.headers.get("x-linked-size")
                    )
                    try:
                        job.total = int(raw_total) if raw_total else None
                    except ValueError:
                        job.total = None

                    with part.open("wb") as handle:
                        async for chunk in response.aiter_bytes(
                            chunk_size=config.DOWNLOAD_CHUNK_SIZE
                        ):
                            if not chunk:
                                continue
                            handle.write(chunk)
                            job.downloaded += len(chunk)
                            if job.total:
                                job.percent = round(
                                    min(100.0, job.downloaded * 100.0 / job.total), 1
                                )
                            job.updated_at = _now()

            # Validate before registering.
            validate_gguf_file(part, require_extension=False)

            db = get_db()
            try:
                duplicate = (
                    db.query(ModelRecord)
                    .filter(ModelRecord.path == str(target))
                    .first()
                )
                if duplicate is not None:
                    raise DownloadConflict(
                        "This model was registered while the download was running."
                    )

                part.replace(target)

                try:
                    record = create_model_record(
                        db,
                        target,
                        name=target.stem,
                        context=job.context,
                    )
                except (DuplicateModel, InvalidModelFile):
                    if not target_existed:
                        target.unlink(missing_ok=True)
                    raise

                job.model_id = record.id
                job.path = record.path
            finally:
                db.close()

            if job.total is None:
                job.total = job.downloaded
            job.percent = 100.0
            job.status = "completed"
            job.updated_at = _now()
            logger.info(
                "Downloaded %s/%s to %s (model id %s)",
                job.repo_id,
                job.filename,
                target,
                job.model_id,
            )
        except asyncio.CancelledError:
            part.unlink(missing_ok=True)
            job.status = "cancelled"
            job.error = "Download cancelled."
            job.updated_at = _now()
            raise
        except (httpx.HTTPError, OSError, DownloadError, InvalidModelFile) as exc:
            part.unlink(missing_ok=True)
            job.status = "failed"
            job.error = str(exc) or "Download failed."
            job.updated_at = _now()
            logger.warning("Download failed for %s/%s: %s", job.repo_id, job.filename, exc)
        except Exception as exc:  # pragma: no cover - unexpected
            part.unlink(missing_ok=True)
            job.status = "failed"
            job.error = "Download failed due to an internal error."
            job.updated_at = _now()
            logger.exception("Unexpected download failure for %s", job.filename)
        finally:
            self._tasks.pop(job.id, None)

    # --------------------------------------------------------------- shutdown

    async def shutdown(self) -> None:
        tasks = [task for task in self._tasks.values() if not task.done()]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._tasks.clear()


download_manager = DownloadManager()
