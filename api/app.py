
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.chat import router as chat_router

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

# Register routers only after creating the app
app.include_router(chat_router)


@app.get("/")
async def root():
    return {"message": "Offline LLM API is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}
