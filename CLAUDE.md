# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

The above describes the **intended** product, and so do the sections below — treat
them as the target design, not a description of what exists. The product is a long
way short of it: see [Current implementation](#current-implementation) at the end of
this file for what is actually built.

## Development process

When instructed to build a feature:
1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via OpenRouter to the `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

There is an OPENROUTER_API_KEY in the .env file in the project root.

## Technical design

Established by PL-4 and in place today:

The entire project is packaged into a Docker container.  
The backend is in backend/ and is a uv project, using FastAPI.  
The frontend is in frontend/  
The database uses SQLite and is created from scratch each time the Docker container is brought up.  
The frontend is statically built (`output: 'export'`) and served by FastAPI — this works, and means there is no Node process at runtime. Next.js route handlers are **not** available under static export, so anything server-side must be a FastAPI endpoint.  
Scripts in scripts/:  
```bash
# Mac
scripts/start-mac.sh    # Start
scripts/stop-mac.sh     # Stop

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1
```
Backend available at http://localhost:8000

Still to build: the `users` table exists but sign up and sign in are not implemented.

## Color Scheme
- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)
- Dark Navy: `#032147` (headings)
- Gray Text: `#888888`

Applied on the login screen, and on the chat and preview panes at `/app` (PL-5).
Accent yellow is still not used anywhere. The rest of `/app` keeps its own greys.

## Current implementation

Last updated: PL-5 (2026-07-15). **Keep this section honest** — it is the first thing
read each session, and an inaccurate claim here misleads every future change.

Built:

- **One document type of eleven.** The Mutual NDA creator at `/app`: an AI intake
  chat, a live preview, and a PDF download. Nothing reads `catalog.json` at runtime.
- **AI intake chat** (PL-5). `backend/app/chat.py` calls `openrouter/openai/gpt-oss-120b`
  via LiteLLM with Cerebras as the provider, using Structured Outputs to return the
  assistant's reply and the extracted deal terms in one call. `POST /api/chat` is
  stateless: the browser sends the transcript plus the fields so far, and gets back
  the merged fields. The form is gone — chat is the only way to fill the document.
- **FastAPI backend** (`backend/`, uv project) serving the static frontend export at
  `/` plus `/api/chat` and two stubs, `/api/health` and `/api/me`. Schema init on
  startup.
- **SQLite** via stdlib `sqlite3` (no ORM — one table). A `users` table, recreated
  empty on every container start because the DB lives in the container's writable
  layer.
- **Single Docker container**, one process, one port (8000). Start/stop scripts for
  mac, linux and windows wrap `docker compose`.

Not built — do not assume otherwise:

- **No authentication.** The login screen at `/` is a placeholder that lets anyone
  through to `/app`. The `users` table is never written to.
- **No document persistence.** Drafts and the chat transcript live in React state and
  are lost on reload. `/api/chat` stores nothing.
- **No backend involvement in *rendering*.** The backend fills fields via the chat,
  but the document itself is still drawn client-side: `frontend/lib/render.ts`
  substitutes placeholders, `frontend/lib/pdf.tsx` draws the PDF with
  `@react-pdf/renderer`. Both the preview and the PDF share `renderNda`, so they
  cannot drift — keep it that way.

Conventions worth knowing:

- `templates/` is the single source of truth for the corpus.
  `frontend/scripts/copy-templates.mjs` copies what the renderer needs into
  `frontend/public/` at build time; `frontend/public/templates/` is generated and
  gitignored, so never edit it.
- **Two field shapes, deliberately.** `MndaFields` (all nullable) is what the user has
  told the AI; `MndaFormValues` (fully populated) is what the renderer needs.
  `toFormValues` in `frontend/lib/types.ts` is the only bridge. Nulls are what let the
  AI know what to ask next, so don't collapse the two.
- **`reasoning_effort` is `"medium"`, not the skill's `"low"`.** At low effort the
  model replies with a bare acknowledgement and forgets to ask the next question
  (measured 1/5 vs 5/5 at medium). Don't lower it without re-checking that.
- **Python is pinned to 3.13** (`backend/.python-version`, and `<3.14` in
  `pyproject.toml`). litellm ships a Rust extension with wheels only up to cp313; on
  3.14 uv builds from sdist and cargo fails. This matches the `python:3.13-slim` image.
- **`OPENROUTER_API_KEY` reaches the container via `env_file: .env`** in
  `docker-compose.yml`. `.env` is both git- and docker-ignored, so it is never baked
  into the image; `config.py` loads it for local dev.

Known pre-existing bugs in the MNDA output (untouched by PL-4 and PL-5, both scoped
elsewhere):

- Every numbered clause renders as "1." in the PDF instead of 1–11.
- The Purpose value is spliced mid-sentence into clause 1, producing ungrammatical
  text.
