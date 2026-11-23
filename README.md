# Offline LLM

A private, local intelligence platform that runs entirely on your device. No cloud APIs, no external services — all AI processing happens locally.

## Overview

Offline LLM is a full-stack application for interacting with local language models through a web interface. It connects to a `llama.cpp` inference server, provides a persistent chat workspace, manages a registry of GGUF models (including downloads from Hugging Face), and monitors the runtime.

The entire stack is designed for privacy: prompts, documents, and conversations never leave your machine.

## Technology Stack

| Layer | Technology | Purpose |
|------|-----------|---------|
| **UI** | React 19, TypeScript, Vite | SPA, type safety, fast dev server |
| **Styling** | Tailwind CSS 3, PostCSS, Autoprefixer | Utility-first styling with custom editorial design |
| **Routing** | react-router-dom 6 | Client-side routing for 6 pages |
| **Backend** | FastAPI 0.162, Python 3.13 | REST API, request validation, OpenAPI docs |
| **Persistence** | SQLAlchemy 2.1 + SQLite | Conversations, messages, model registry |
| **Inference** | llama.cpp, GGUF models | Local LLM inference via OpenAI-compatible API |
| **HTTP** | httpx (async) | Async HTTP client for backend communication |
| **Validation** | Pydantic 2.12 | Request body validation |
| **Testing** | unittest, Vitest, Testing Library | Backend and frontend test suites |

## Repository Structure

```
offline-llm/
├── api/                    # Python FastAPI backend
│   ├── app.py              # FastAPI app, CORS, lifespan cleanup
│   ├── config.py           # Environment-driven settings
│   ├── models.py           # SQLAlchemy tables, sessions, index migration
│   ├── conversations.py    # Conversation/message persistence helpers
│   ├── chat_service.py     # Streaming generation + assistant persistence
│   ├── registry.py         # GGUF validation, registration, serialization
│   ├── downloads.py        # Hugging Face download jobs + SSE progress
│   ├── runtime.py          # Managed llama-server lifecycle
│   ├── llama_client.py     # Async client for llama.cpp API
│   ├── routes/             # chat, model, and system route handlers
│   ├── tests/              # unittest suite
│   ├── models/             # Downloaded/registered GGUF files (gitignored)
│   ├── logs/               # Managed llama-server logs (gitignored)
│   ├── requirements.txt    # Python dependencies
│   └── .env.example        # Environment variable template
├── web/                    # React TypeScript frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components (6 views)
│   │   ├── store/          # Shared persisted settings store
│   │   ├── lib/api.ts      # Typed backend client
│   │   ├── types.ts        # Shared TypeScript interfaces
│   │   └── vite-env.d.ts   # Vite type declarations
│   ├── package.json        # Dependencies and scripts
│   ├── vite.config.ts      # Vite config (port 5173)
│   ├── vitest.config.ts    # Vitest config (jsdom)
│   └── tailwind.config.ts  # Tailwind config
├── .github/workflows/      # GitHub Actions CI
├── Makefile                # `make dev`, `make test`, `make lint`, `make build`
└── README.md
```

## Prerequisites

- [Python 3.11+](https://www.python.org/downloads/) (3.13 tested)
- [Node.js 20+](https://nodejs.org/) and npm (22 tested)
- [`llama-server`](https://github.com/ggerganov/llama.cpp) on `PATH`
  (`brew install llama.cpp`)
- A GGUF model file, or network access to Hugging Face

You do **not** need to start `llama-server` yourself — the backend can manage it.

## Installation

```bash
git clone <repository-url>
cd offline-llm

# Backend
cd api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../web
# eslint-plugin-react does not declare ESLint 10 support yet, so the existing
# lockfile requires legacy peer resolution.
npm install --legacy-peer-deps
```

## Configuration

```bash
cp api/.env.example api/.env
cp web/.env.example web/.env.local   # optional
```

Every backend setting has a default; see `api/.env.example` for the full list.
The most relevant ones:

| Variable | Default | Purpose |
|----------|---------|---------|
| `MODELS_DIR` | `api/models` | Where GGUF files are stored |
| `MODEL_LOG_DIR` | `api/logs` | Managed server logs |
| `DATABASE_URL` | `sqlite:///api/database.sqlite` | Registry + conversations |
| `LLAMA_SERVER_BIN` | `llama-server` | Binary for managed instances |
| `MODEL_PORT_START` / `MODEL_PORT_END` | `8081` / `8181` | Port scan range |
| `MODEL_LOAD_TIMEOUT` | `180` | Seconds to wait for readiness |
| `MODEL_REASONING` | `off` | `on` / `off` / `auto` |
| `MAX_CHAT_TOKENS` | `8192` | Upper bound for `max_tokens` |
| `LLAMA_BASE_URL` | `http://127.0.0.1:8080` | External server fallback |

Frontend: `VITE_API_URL` (default `http://127.0.0.1:8000`).

## Running

```bash
make dev
```

This starts:

- Frontend: <http://localhost:5173>
- Backend API: <http://127.0.0.1:8000> (OpenAPI at `/docs`)

Or run them separately:

```bash
# Backend
cd api && python3 -m uvicorn app:app --reload --host 127.0.0.1 --port 8000

# Frontend
cd web && npm run dev
```

Then open the **Models** page, download or register a GGUF file, and click
**Load**. The backend starts a managed `llama-server` on a free port and chat
uses it automatically.

## Model Lifecycle

- **Registry** — models persist in SQLite across restarts with `id`, `name`,
  `path`, `quant`, `size`, `context`, and `created_at`.
- **Downloads** — fetch a single GGUF from a Hugging Face repo. Progress is
  streamed as Server-Sent Events with real byte counts. Files are validated
  (`GGUF` magic) and registered automatically.
- **Runtime** — one managed `llama-server` at a time. The backend allocates a
  free port, waits for `/health`, tracks PID/port/status, and terminates the
  process group on unload or shutdown.
- **Deletion** — removes both the registry row and the GGUF file. Loaded models
  must be unloaded first.
- **Safety** — only paths inside `MODELS_DIR` are accepted (traversal and
  symlink escapes rejected); duplicate registrations and downloads return 409.

## Conversations and Settings

Conversations and messages are persisted in SQLite. The workspace creates a
conversation before the first turn, restores it from
`/workspace?conversation=<id>` after a reload, and can delete or rename saved
conversations from the **Conversations** page.

Regeneration targets the answer whose **Regenerate** button was clicked. The
client sends `replace_assistant_index`, the 0-based ordinal of that answer among
the conversation's assistant messages, and the backend updates that row in place
so surrounding turns and their order are preserved.

Settings are stored in one shared, persisted store (`web/src/store/settingsStore.ts`)
used by both the Settings page and the chat workspace. Values survive a browser
reload and are applied to the next request:

- temperature (`0–2`)
- top-p (`0–1`)
- maximum tokens (`256–8192`, aligned with the backend `MAX_CHAT_TOKENS`)
- streaming on/off (selects `/api/chat/stream` or `/api/chat`)
- default model

The Settings page also exposes maintenance actions. Only capabilities the
backend reports as supported are enabled: **Clear chat history** is implemented,
while **Clear indexed documents** and **Clear local cache** are disabled with the
backend's reason until those features exist.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Root status message |
| `GET` | `/health` | Health check |
| `GET` | `/api/models` | List registered models |
| `POST` | `/api/models` | Register an existing GGUF file |
| `POST` | `/api/models/download` | Download from Hugging Face (SSE progress) |
| `GET` | `/api/models/downloads` | List download jobs |
| `GET` | `/api/models/downloads/{id}` | Poll a download job |
| `GET` | `/api/models/runtime` | Managed runtime status |
| `POST` | `/api/models/{id}/load` | Start managed llama-server |
| `POST` | `/api/models/{id}/unload` | Stop managed llama-server |
| `DELETE` | `/api/models/{id}` | Remove model + file |
| `POST` | `/api/chat` | Non-streaming chat (persists both turns) |
| `POST` | `/api/chat/stream` | Streaming chat (SSE; persists both turns) |
| `GET` | `/api/chat/health` | Backend + llama-server health |
| `GET` | `/api/chat/models` | Legacy proxy to llama.cpp `/v1/models` |
| `GET` | `/api/chat/conversations` | List conversations (newest activity first) |
| `POST` | `/api/chat/conversations` | Create a conversation |
| `GET` | `/api/chat/conversations/{id}` | Conversation with ordered messages |
| `PATCH` | `/api/chat/conversations/{id}` | Rename a conversation |
| `DELETE` | `/api/chat/conversations/{id}` | Delete a conversation + messages |
| `DELETE` | `/api/chat/conversations` | Delete every conversation (clear history) |
| `POST` | `/api/chat/conversations/{id}/messages` | Append a message |
| `GET` | `/api/chat/conversations/{id}/messages` | List a conversation's messages |
| `GET` | `/api/system/capabilities` | Supported maintenance actions |

### Chat request

```json
{
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.2,
  "top_p": 0.9,
  "max_tokens": 512,
  "model_id": "optional-registered-model-id",
  "conversation_id": "optional-existing-conversation-id",
  "persist_user_message": true,
  "replace_assistant_index": null
}
```

- `temperature`, `top_p`, and `max_tokens` are forwarded to llama.cpp.
- `model_id` must match the model currently loaded by the managed runtime when
  one is active; otherwise the API returns `409`.
- `conversation_id` appends the turn to an existing conversation. Omit it to
  create a new conversation; the response includes `conversation_id` and
  `conversation_title`.
- `persist_user_message` defaults to `true`. Set it to `false` when regenerating
  so the existing user prompt is not duplicated.
- `replace_assistant_index` is the 0-based ordinal of the assistant answer to
  regenerate. The backend updates that message in place; an out-of-range index
  returns `404`.

### Chat response

```json
{
  "content": "Hello! How can I help you today?",
  "model": "/.../Qwen3.5-0.8B-Q8_0.gguf",
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 23,
    "total_tokens": 38
  },
  "conversation_id": "9b2f...",
  "conversation_title": "Hello!"
}
```

## Frontend Pages

- **Workspace** (`/workspace`) — Chat with a registry-backed model selector,
  persisted settings, streaming or non-streaming responses, and per-turn
  regeneration. The selected model is loaded automatically before the first
  message.
- **Conversations** (`/conversations`) — Saved conversation browser with reload,
  rename, and delete.
- **Documents** (`/documents`) — Document knowledge base UI (mock-backed;
  backend parsing/indexing is not implemented yet).
- **Models** (`/models`) — Download, register, load, unload, and delete GGUF models.
- **System** (`/system`) — Runtime and model status from the backend.
- **Settings** (`/settings`) — Persisted inference settings, default model, and
  capability-gated maintenance actions.

## Development

### Frontend

```bash
cd web
npm run dev        # Vite dev server on :5173
npm run build      # Type check + production build
npm run lint       # ESLint
npm test           # Vitest (jsdom + Testing Library)
npx tsc --noEmit   # Type check only
```

### Backend

```bash
cd api
python3 -m uvicorn app:app --reload  # FastAPI on :8000
```

### Tests

```bash
make test            # Backend + frontend suites
make test-backend    # python3 -m unittest discover -s api/tests -v
make test-frontend   # cd web && npm test
```

Other useful targets: `make typecheck`, `make lint`, `make build`.

### Continuous integration

`.github/workflows/ci.yml` runs two jobs on push, pull request, and manual
dispatch:

- **Backend** — installs `api/requirements.txt` and runs the unittest suite. The
  test bootstrap disables `llama-server`, so CI needs no model or inference
  service.
- **Frontend** — `npm ci --legacy-peer-deps`, then type check, lint, Vitest, and
  the production build.

## Troubleshooting

Common issues:

1. **Connection refused to backend** — ensure FastAPI is running and
   `VITE_API_URL` matches.
2. **`llama-server binary not found`** — install llama.cpp or set
   `LLAMA_SERVER_BIN`.
3. **`llama-server did not become ready`** — check
   `api/logs/llama-<id>-<port>.log`; try a smaller context or larger timeout.
4. **Empty assistant replies** — reasoning models may fill the token budget
   with reasoning output; keep `MODEL_REASONING=off` or raise `max_tokens`.
5. **`409 Model already loaded`** — unload the current model first.
6. **Path rejected** — model paths must resolve inside `MODELS_DIR`.
7. **`npm install` peer dependency error** — use
   `npm install --legacy-peer-deps` (see Installation).

## License

This project is licensed under the MIT License.
