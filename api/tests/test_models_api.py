"""Automated tests for the Phase 3 model registry and lifecycle API.

Run from the repository root:

    python3 -m unittest discover -s api/tests -v

The tests use a temporary SQLite database and models directory, and never
touch the developer's real registry or start a real llama-server.
"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

API_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_DIR))

_TMP = tempfile.mkdtemp(prefix="offline-llm-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.sqlite"
os.environ["MODELS_DIR"] = f"{_TMP}/models"
os.environ["MODEL_LOG_DIR"] = f"{_TMP}/logs"
os.environ["LLAMA_SERVER_BIN"] = "/nonexistent/llama-server"
os.environ["MODEL_LOAD_TIMEOUT"] = "2"

from fastapi.testclient import TestClient  # noqa: E402

from app import app  # noqa: E402
from models import ModelRecord, get_db  # noqa: E402
from registry import detect_quant  # noqa: E402
from runtime import runtime_manager  # noqa: E402


def _make_gguf(name: str, payload: bytes = b"GGUF" + b"\x00" * 64) -> Path:
    models_dir = Path(os.environ["MODELS_DIR"])
    models_dir.mkdir(parents=True, exist_ok=True)
    path = models_dir / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return path


class ModelsApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client.__exit__(None, None, None)
        shutil.rmtree(_TMP, ignore_errors=True)

    def setUp(self) -> None:
        db = get_db()
        try:
            db.query(ModelRecord).delete()
            db.commit()
        finally:
            db.close()

        models_dir = Path(os.environ["MODELS_DIR"])
        if models_dir.exists():
            for item in models_dir.rglob("*"):
                if item.is_file():
                    item.unlink()

        runtime_manager._state = type(runtime_manager._state)()  # reset snapshot
        runtime_manager._process = None

    # ------------------------------------------------------------- registry

    def test_empty_registry(self) -> None:
        response = self.client.get("/api/models")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_register_list_and_persist(self) -> None:
        _make_gguf("Tiny-Q4_K_M.gguf")

        response = self.client.post(
            "/api/models",
            json={"path": "Tiny-Q4_K_M.gguf", "context": 2048},
        )
        self.assertEqual(response.status_code, 201, response.text)

        body = response.json()
        self.assertEqual(body["name"], "Tiny-Q4_K_M")
        self.assertEqual(body["quant"], "Q4_K_M")
        self.assertEqual(body["context"], 2048)
        self.assertEqual(body["size"], 68)
        self.assertFalse(body["loaded"])
        self.assertEqual(body["status"], "available")

        listed = self.client.get("/api/models")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(listed.json()[0]["id"], body["id"])

        # A fresh session sees the same row: persistence, not in-memory state.
        db = get_db()
        try:
            self.assertEqual(db.query(ModelRecord).count(), 1)
        finally:
            db.close()

    def test_duplicate_register_conflicts(self) -> None:
        _make_gguf("Dup-Q5_K_M.gguf")
        first = self.client.post("/api/models", json={"path": "Dup-Q5_K_M.gguf"})
        self.assertEqual(first.status_code, 201)

        second = self.client.post("/api/models", json={"path": "Dup-Q5_K_M.gguf"})
        self.assertEqual(second.status_code, 409)

    def test_register_rejects_traversal_and_invalid_files(self) -> None:
        _make_gguf("ok-Q8_0.gguf")
        outside = self.client.post("/api/models", json={"path": "../outside.gguf"})
        self.assertEqual(outside.status_code, 400)

        _make_gguf("not-a-model.gguf", b"NOTGGUF")
        invalid = self.client.post("/api/models", json={"path": "not-a-model.gguf"})
        self.assertEqual(invalid.status_code, 400)

        wrong_ext = _make_gguf("model.bin")
        response = self.client.post("/api/models", json={"path": str(wrong_ext)})
        self.assertEqual(response.status_code, 400)

    def test_delete_removes_record_and_file(self) -> None:
        path = _make_gguf("Delete-Me-Q4_0.gguf")
        created = self.client.post("/api/models", json={"path": path.name})
        self.assertEqual(created.status_code, 201)
        model_id = created.json()["id"]

        deleted = self.client.delete(f"/api/models/{model_id}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertTrue(deleted.json()["success"])
        self.assertTrue(deleted.json()["file_removed"])
        self.assertFalse(path.exists())

        self.assertEqual(self.client.get("/api/models").json(), [])
        self.assertEqual(self.client.delete(f"/api/models/{model_id}").status_code, 404)

    def test_delete_loaded_model_conflicts(self) -> None:
        path = _make_gguf("Loaded-Q4_K_M.gguf")
        created = self.client.post("/api/models", json={"path": path.name})
        model_id = created.json()["id"]

        fake_runtime = {
            "status": "running",
            "model_id": model_id,
            "model_name": "Loaded-Q4_K_M",
        }
        with patch.object(runtime_manager, "snapshot", return_value=fake_runtime):
            response = self.client.delete(f"/api/models/{model_id}")

        self.assertEqual(response.status_code, 409)
        self.assertTrue(path.exists())

    # ------------------------------------------------------------- download

    def test_download_validation(self) -> None:
        bad_repo = self.client.post(
            "/api/models/download",
            json={"repo_id": "not-a-repo", "filename": "model.gguf"},
        )
        self.assertEqual(bad_repo.status_code, 400)

        traversal = self.client.post(
            "/api/models/download",
            json={"repo_id": "owner/repo", "filename": "../escape.gguf"},
        )
        self.assertEqual(traversal.status_code, 400)

        wrong_ext = self.client.post(
            "/api/models/download",
            json={"repo_id": "owner/repo", "filename": "model.bin"},
        )
        self.assertEqual(wrong_ext.status_code, 400)

    # -------------------------------------------------------------- runtime

    def test_runtime_endpoint_when_idle(self) -> None:
        response = self.client.get("/api/models/runtime")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "unloaded")
        self.assertFalse(body["managed"])
        self.assertIn("external_url", body)
        self.assertIn("models_dir", body)

    def test_load_missing_model_404(self) -> None:
        response = self.client.post("/api/models/does-not-exist/load")
        self.assertEqual(response.status_code, 404)

    def test_load_without_binary_returns_503(self) -> None:
        path = _make_gguf("No-Binary-Q4_K_M.gguf")
        created = self.client.post("/api/models", json={"path": path.name})
        model_id = created.json()["id"]

        response = self.client.post(f"/api/models/{model_id}/load")
        self.assertEqual(response.status_code, 503)
        self.assertIn("llama-server", response.json()["detail"])

    def test_unload_idle_is_idempotent(self) -> None:
        path = _make_gguf("Idle-Q4_K_M.gguf")
        created = self.client.post("/api/models", json={"path": path.name})
        model_id = created.json()["id"]

        response = self.client.post(f"/api/models/{model_id}/unload")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "unloaded")

    # --------------------------------------------------------------- helpers

    def test_quant_detection(self) -> None:
        self.assertEqual(detect_quant("model-Q4_K_M.gguf"), "Q4_K_M")
        self.assertEqual(detect_quant("model-Q8_0.gguf"), "Q8_0")
        self.assertEqual(detect_quant("model.IQ3_XS.gguf"), "IQ3_XS")
        self.assertEqual(detect_quant("model-F16.gguf"), "F16")
        self.assertEqual(detect_quant("mystery.gguf"), "UNKNOWN")


if __name__ == "__main__":
    unittest.main()
