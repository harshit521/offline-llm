# Offline LLM Development Makefile
# Starts all three development processes with one command.

.PHONY: dev help

# Default target: start development environment
dev: ## Start all development servers (frontend, backend, llama.cpp status)
	@echo ">>> Starting Offline LLM development environment"
	@echo ""
	@echo ">>> Starting backend API server (FastAPI on http://127.0.0.1:8000)"
	@cd api && source venv/bin/activate && uvicorn app:app --reload &
	BACKEND_PID=$!
	@echo ">>> Backend started (PID: $$BACKEND_PID)"
	@echo ""
	@echo ">>> Starting frontend development server (Vite on http://localhost:5173)"
	@cd web && npm run dev &
	FRONTEND_PID=$!
	@echo ">>> Frontend started (PID: $$FRONTEND_PID)"
	@echo ""
	@echo ">>> Development environment is running"
	@echo ">>>  - Frontend: http://localhost:5173"
	@echo ">>>  - Backend API: http://127.0.0.1:8000"
	@echo ">>>  - LLM inference: http://127.0.0.1:8080 (llama.cpp)"
	@echo ""
	@echo ">>> Press Ctrl+C to stop all servers"
	@wait