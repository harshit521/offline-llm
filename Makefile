# Offline LLM Development Makefile
# Starts the backend and frontend with one command.

PYTHON ?= python3
API_DIR := api
WEB_DIR := web

.PHONY: dev backend frontend test test-backend test-frontend typecheck lint build help

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

dev: ## Start backend and frontend together
	@echo ">>> Starting Offline LLM development environment"
	@echo ">>> Backend:  http://127.0.0.1:8000"
	@echo ">>> Frontend: http://localhost:5173"
	@echo ">>> Press Ctrl+C to stop both."
	@$(MAKE) -j2 backend frontend

backend: ## Run the FastAPI backend with reload
	cd $(API_DIR) && $(PYTHON) -m uvicorn app:app --reload --host 127.0.0.1 --port 8000

frontend: ## Run the Vite dev server
	cd $(WEB_DIR) && npm run dev

test: test-backend test-frontend ## Run the complete test suite (backend + frontend)

test-backend: ## Run backend unit tests
	$(PYTHON) -m unittest discover -s api/tests -v

test-frontend: ## Run frontend unit tests
	cd $(WEB_DIR) && npm test

typecheck: ## Type-check the frontend
	cd $(WEB_DIR) && npx tsc --noEmit

lint: ## Lint the frontend
	cd $(WEB_DIR) && npm run lint

build: ## Type-check and build the frontend for production
	cd $(WEB_DIR) && npm run build
