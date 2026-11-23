"""Shared test bootstrap.

Both test modules import this before importing the application so they use the
same temporary SQLite database, models directory, and disabled llama-server.
"""

from __future__ import annotations

import atexit
import os
import shutil
import sys
import tempfile
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

TMP_DIR = tempfile.mkdtemp(prefix="offline-llm-tests-")

os.environ["DATABASE_URL"] = f"sqlite:///{TMP_DIR}/test.sqlite"
os.environ["MODELS_DIR"] = f"{TMP_DIR}/models"
os.environ["MODEL_LOG_DIR"] = f"{TMP_DIR}/logs"
os.environ["LLAMA_SERVER_BIN"] = "/nonexistent/llama-server"
os.environ["MODEL_LOAD_TIMEOUT"] = "2"

atexit.register(shutil.rmtree, TMP_DIR, ignore_errors=True)
