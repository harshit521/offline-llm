import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from downloads import download_manager
from models import init_db
from routes.chat import router as chat_router
from routes.models import router as models_router
from runtime import runtime_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("offline_llm.app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    config.ensure_directories()
    logger.info("Models directory: %s", config.MODELS_DIR)
    try:
        yield
    finally:
        await download_manager.shutdown()
        await runtime_manager.shutdown()


app = FastAPI(title="Offline LLM API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(chat_router)
app.include_router(models_router)


@app.get("/")
async def root():
    return {"message": "Offline LLM API is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}
