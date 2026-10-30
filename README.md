# Offline LLM

A private, local intelligence platform that runs entirely on your device. No cloud APIs, no external services — all AI processing happens locally.

## Overview

Offline LLM is a full-stack application for interacting with local language models via a beautiful web interface. It connects to a `llama.cpp` inference server running on your machine, providing a chat interface, model management, document knowledge base, and system monitoring.

The entire stack is designed for privacy: prompts, documents, and conversations never leave your machine.

## Technology Stack

| Layer | Technology | Purpose |
|------|-----------|---------|
| **UI** | React 19, TypeScript, Vite | SPA, type safety, fast dev server |
| **Styling** | Tailwind CSS 3, PostCSS, Autoprefixer | Utility-first styling with custom editorial design |
| **Routing** | react-router-dom 6 | Client-side routing for 6 pages |
| **Backend** | FastAPI 0.162, Python 3.13 | REST API, request validation, OpenAPI docs |
| **Inference** | llama.cpp, GGUF models | Local LLM inference via OpenAI-compatible API |
| **HTTP** | httpx (async) | Async HTTP client for backend communication |
| **Validation** | Pydantic 2.12 | Request body validation |

## Repository Structure

```
offline-llm/
├── api/              # Python FastAPI backend
│   ├── app.py        # FastAPI app with CORS and routers
│   ├── llama_client.py  # Async client for llama.cpp API
│   ├── routes/       # API route handlers
│   ├── requirements.txt  # Python dependencies
│   └── .env          # Environment variables (local only)
├── web/              # React TypeScript frontend
│   ├── src/          # Source code
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Page components (6 views)
│   │   ├── lib/         # API client and mock data
│   │   ├── types.ts     # Shared TypeScript interfaces
│   │   └── vite-env.d.ts  # Vite type declarations
│   ├── index.html     # HTML template
│   ├── package.json   # Dependencies and scripts
│   ├── vite.config.ts # Vite config (port 5173)
│   └── tailwind.config.ts # Tailwind config
├── Makefile          # Development startup script (to be added)
└── README.md        # This file
```

## Prerequisites

- [Python 3.13+](https://www.python.org/downloads/) with `venv`
- [Node.js 20+](https://nodejs.org/) and [pnpm/yarn/npm](https://www.npmjs.com/)
- [llama.cpp server](https://github.com/ggerganov/llama.cpp) running locally with a GGUF model
- Approximately 5-18 GB of RAM depending on model size and quantisation

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd offline-llm
```

### 2. Install frontend dependencies

```bash
cd web
npm install
# or
pnpm install
```

### 3. Install backend dependencies

```bash
cd ../api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Configure environment variables

Copy the example environment files and adjust as needed:

```bash
cp api/.env api/.env.local  # or edit directly
cp web/.env.example web/.env.local
```

Edit the `.env.local` files if you use non-default ports.

### 5. Start the llama.cpp server

Ensure your llama.cpp server is running with a GGUF model. By default, the application expects it at `http://127.0.0.1:8080`.

```bash
llama-server -m models/qwen3-5b.Q4_K_M.gguf -c 5120 -ngl 32
```

### 6. Start the development servers

```bash
make dev
# or start manually:
# Backend:  cd api && source venv/bin/activate && uvicorn app:app --reload
# Frontend: cd web && npm run dev
```

The application will be available at `http://localhost:5173`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Root endpoint, returns status message |
| `GET` | `/health` | Health check |
| `POST` | `/api/chat` | Send a chat message to the LLM |
| `GET` | `/api/models` | List available models from llama.cpp |

### Chat Request

```json
{
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.2,
  "max_tokens": 512
}
```

### Chat Response

```json
{
  "content": "Hello! How can I help you today?",
  "model": "Qwen3.5 0.8B (GGUF)",
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 23,
    "total_tokens": 38
  }
}
```

## Frontend Pages

- **Workspace** (`/workspace`) — Main chat interface with model selection, message history, regeneration, and export
- **Conversations** (`/conversations`) — Session history browser (local mock data)
- **Documents** (`/documents`) — Document upload and knowledge base management (UI only, backend parsing pending)
- **Models** (`/models`) — View models served by llama.cpp; add new models (not yet implemented)
- **System** (`/system`) — Runtime statistics (CPU, memory, GPU, token throughput — some values hardcoded for demo)
- **Settings** (`/settings`) — Configuration for temperature, top-p, max tokens, and streaming

## Development

### Frontend

```bash
cd web
npm run dev      # Vite dev server on :5173
npm run build    # Production build
npm run lint     # ESLint (if configured)
```

### Backend

```bash
cd api
source venv/bin/activate
uvicorn app:app --reload  # FastAPI on :8000
```

## Troubleshooting

### Common issues

1. **Connection refused to backend**: Ensure the FastAPI server is running and `VITE_API_URL` is set correctly in `web/.env.local`.

2. **llama.cpp not found**: Check that the llama.cpp server is running on the expected port (`127.0.0.1:8080` default). Verify `LLAMA_BASE_URL` in `api/.env.local`.

3. **TypeScript errors**: Run `npm run typecheck` or `npx tsc --noEmit` to identify and fix type errors.

4. **Model not appearing**: Ensure the GGUF model file is accessible by llama.cpp and the server is running with the model loaded.

5. **Environment variable not recognized**: Ensure `web/vite-env.d.ts` exists with `/// <reference types="vite-client" />`.

## License

This project is licensed under the MIT License.