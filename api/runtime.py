"""Managed llama-server lifecycle.

Only one managed inference process is allowed at a time. The manager allocates
a free port, spawns ``llama-server``, waits for ``/health`` to report ready, and
only then reports success. Stopping terminates the whole process group and
restores the external ``LLAMA_BASE_URL`` fallback.
"""

from __future__ import annotations

import asyncio
import atexit
import logging
import os
import shutil
import signal
import socket
import subprocess
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

import config
import llama_client
from registry import resolve_model_path

logger = logging.getLogger("offline_llm.runtime")


class ModelRuntimeError(Exception):
    """Base class for managed runtime failures."""


class RuntimeConflict(ModelRuntimeError):
    """Another model is starting, stopping, or already loaded."""


class RuntimeUnavailable(ModelRuntimeError):
    """llama-server could not be launched or did not become ready."""


@dataclass
class RuntimeState:
    status: str = "unloaded"  # unloaded | starting | running | stopping | error
    model_id: str | None = None
    model_name: str | None = None
    model_quant: str | None = None
    model_context: int | None = None
    port: int | None = None
    pid: int | None = None
    base_url: str | None = None
    started_at: str | None = None
    error: str | None = None


def _find_free_port(start: int, end: int) -> int:
    """Return the first bindable port in ``[start, end]``."""
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeUnavailable(
        f"No free port available in range {start}-{end}."
    )


def _read_log_tail(path: Path, lines: int = 25) -> str:
    try:
        content = path.read_text(errors="replace").splitlines()
    except OSError:
        return ""
    return "\n".join(content[-lines:])


class RuntimeManager:
    def __init__(self) -> None:
        self._state = RuntimeState()
        self._process: subprocess.Popen[bytes] | None = None
        self._log_file = None
        self._log_path: Path | None = None
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------ state

    def snapshot(self) -> dict[str, Any]:
        data = asdict(self._state)
        data["managed"] = self._state.base_url is not None
        data["external_url"] = config.EXTERNAL_LLAMA_BASE_URL
        return data

    def _process_alive(self) -> bool:
        return self._process is not None and self._process.poll() is None

    # ------------------------------------------------------------------- load

    async def load(
        self,
        *,
        model_id: str,
        name: str,
        path: str,
        quant: str,
        context: int,
    ) -> dict[str, Any]:
        async with self._lock:
            if self._state.status in {"starting", "stopping"}:
                raise RuntimeConflict(
                    "A model is already starting or stopping. Try again shortly."
                )

            if self._process_alive():
                if self._state.model_id == model_id:
                    return self.snapshot()
                raise RuntimeConflict(
                    f"Model '{self._state.model_name}' is already loaded. "
                    "Unload it before loading another model."
                )

            # A previous process exited without a clean stop.
            if self._process is not None:
                self._close_log()
                self._process = None
                llama_client.set_runtime_base_url(None)

            resolved = resolve_model_path(path)
            if not resolved.exists():
                raise RuntimeUnavailable(
                    "The model file no longer exists on disk. "
                    "Re-register or download it again."
                )

            binary = shutil.which(config.LLAMA_SERVER_BIN)
            if binary is None:
                raise RuntimeUnavailable(
                    f"llama-server binary not found ({config.LLAMA_SERVER_BIN!r}). "
                    "Install llama.cpp or set LLAMA_SERVER_BIN."
                )

            port = _find_free_port(config.MODEL_PORT_START, config.MODEL_PORT_END)
            config.ensure_directories()
            log_path = config.MODEL_LOG_DIR / f"llama-{model_id}-{port}.log"

            self._state = RuntimeState(
                status="starting",
                model_id=model_id,
                model_name=name,
                model_quant=quant,
                model_context=context,
                port=port,
                base_url=f"http://127.0.0.1:{port}",
            )

            command = [
                binary,
                "-m",
                str(resolved),
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
                "-c",
                str(context),
                "--jinja",
                "--reasoning",
                config.MODEL_REASONING,
            ]
            if config.MODEL_GPU_LAYERS is not None:
                command.extend(["-ngl", str(config.MODEL_GPU_LAYERS)])
            if config.MODEL_THREADS is not None:
                command.extend(["-t", str(config.MODEL_THREADS)])

            logger.info(
                "Starting llama-server for model %s on port %s: %s",
                model_id,
                port,
                " ".join(command),
            )

            try:
                self._log_path = log_path
                self._log_file = log_path.open("wb")
                self._process = subprocess.Popen(
                    command,
                    stdin=subprocess.DEVNULL,
                    stdout=self._log_file,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                    cwd=str(config.BASE_DIR),
                )
            except OSError as exc:
                self._cleanup_failed_start()
                self._state.status = "error"
                self._state.error = f"Could not launch llama-server: {exc}"
                raise RuntimeUnavailable(self._state.error) from exc

            self._state.pid = self._process.pid

            ready, reason = await self._wait_until_ready(self._process, port)
            if not ready:
                tail = _read_log_tail(log_path)
                logger.error(
                    "llama-server failed to start (%s). Log tail:\n%s", reason, tail
                )
                await self._stop_process_locked()
                self._state = RuntimeState(
                    status="error",
                    model_id=model_id,
                    model_name=name,
                    error=(
                        "llama-server did not become ready. "
                        "Check the backend logs for details."
                    ),
                )
                raise RuntimeUnavailable(self._state.error)

            self._state.status = "running"
            self._state.started_at = datetime.now(timezone.utc).isoformat()
            self._state.error = None
            llama_client.set_runtime_base_url(self._state.base_url)

            logger.info(
                "Model %s is running on %s (pid=%s)",
                model_id,
                self._state.base_url,
                self._state.pid,
            )
            return self.snapshot()

    async def _wait_until_ready(
        self, process: subprocess.Popen[bytes], port: int
    ) -> tuple[bool, str]:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + config.MODEL_LOAD_TIMEOUT
        url = f"http://127.0.0.1:{port}/health"
        timeout = httpx.Timeout(connect=1.0, read=2.0, write=2.0, pool=1.0)

        async with httpx.AsyncClient(timeout=timeout) as client:
            while True:
                if process.poll() is not None:
                    return False, f"process exited with code {process.returncode}"

                try:
                    response = await client.get(url)
                    if response.status_code == 200:
                        return True, "ready"
                except httpx.HTTPError:
                    pass

                if loop.time() >= deadline:
                    return False, f"timed out after {config.MODEL_LOAD_TIMEOUT}s"

                await asyncio.sleep(0.4)

    # ----------------------------------------------------------------- unload

    async def unload(self, model_id: str | None = None) -> dict[str, Any]:
        async with self._lock:
            if model_id is not None and self._state.model_id not in {None, model_id}:
                raise RuntimeConflict(
                    f"Model '{self._state.model_name}' is loaded, not the requested model."
                )

            if not self._process_alive():
                self._close_log()
                self._process = None
                llama_client.set_runtime_base_url(None)
                self._state = RuntimeState()
                return self.snapshot()

            self._state.status = "stopping"
            await self._stop_process_locked()
            self._state = RuntimeState()
            return self.snapshot()

    async def _stop_process_locked(self) -> None:
        process = self._process
        if process is None:
            self._close_log()
            llama_client.set_runtime_base_url(None)
            return

        if process.poll() is None:
            try:
                os.killpg(os.getpgid(process.pid), signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                process.terminate()

            try:
                await asyncio.to_thread(process.wait, config.MODEL_STOP_TIMEOUT)
            except subprocess.TimeoutExpired:
                logger.warning(
                    "llama-server pid %s did not stop; sending SIGKILL", process.pid
                )
                try:
                    os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    process.kill()
                await asyncio.to_thread(process.wait, 5)

        self._process = None
        self._close_log()
        llama_client.set_runtime_base_url(None)

    # ---------------------------------------------------------------- helpers

    def _cleanup_failed_start(self) -> None:
        self._process = None
        self._close_log()
        llama_client.set_runtime_base_url(None)

    def _close_log(self) -> None:
        if self._log_file is not None:
            try:
                self._log_file.close()
            except OSError:
                pass
            self._log_file = None

    async def shutdown(self) -> None:
        """Best-effort cleanup used by the FastAPI lifespan."""
        try:
            await self.unload()
        except Exception:  # pragma: no cover - shutdown must never raise
            logger.exception("Failed to stop managed llama-server during shutdown")

    def sync_shutdown(self) -> None:
        """atexit fallback if the ASGI lifespan did not run."""
        process = self._process
        if process is not None and process.poll() is None:
            try:
                os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                process.wait(timeout=5)
            except (ProcessLookupError, PermissionError, subprocess.TimeoutExpired):
                try:
                    os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    pass
        self._close_log()
        llama_client.set_runtime_base_url(None)


runtime_manager = RuntimeManager()
atexit.register(runtime_manager.sync_shutdown)
