"""System capability discovery.

The Settings page uses this to avoid presenting actions the backend cannot
perform. Only capabilities that are actually implemented are advertised as
supported; everything else includes a human-readable reason.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/capabilities")
async def capabilities():
    """Describe the maintenance actions the backend can safely perform."""
    return {
        "clear_history": {
            "supported": True,
            "endpoint": "DELETE /api/chat/conversations",
            "reason": None,
        },
        "clear_documents": {
            "supported": False,
            "endpoint": None,
            "reason": "Document indexing is not implemented in this build.",
        },
        "clear_cache": {
            "supported": False,
            "endpoint": None,
            "reason": (
                "This backend does not manage a cache directory. "
                "llama.cpp keeps only an in-memory prompt cache that is "
                "released when the model is unloaded."
            ),
        },
    }
