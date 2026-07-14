# Stage 1: build the frontend to static HTML/JS.
FROM node:22-alpine AS frontend

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# copy-templates.mjs reads the corpus from ../templates at build time.
COPY templates/ ../templates/
RUN npm run build

# Stage 2: the backend, which also serves the export from stage 1.
FROM python:3.13-slim AS runtime

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/app ./app
COPY --from=frontend /build/out ./static

ENV PATH="/app/.venv/bin:$PATH" \
    PRELEGAL_STATIC_DIR=/app/static \
    PRELEGAL_DB_PATH=/app/data/prelegal.db

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
