
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.chat import router as chat_router
from models import init_db

app = FastAPI(title="Offline LLM API")
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

# Initialize database on startup
init_db()


@app.get("/")
async def root():
    return {"message": "Offline LLM API is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}
