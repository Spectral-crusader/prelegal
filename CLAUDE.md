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

Applied on the login screen only, and accent yellow is not used anywhere yet. The
MNDA creator at `/app` predates the scheme and still uses its own greys.

## Current implementation

Last updated: PL-4 (2026-07-15). **Keep this section honest** — it is the first thing
read each session, and an inaccurate claim here misleads every future change.

Built:

- **One document type of eleven.** The Mutual NDA creator at `/app`: a form, a live
  preview, and a PDF download. Nothing reads `catalog.json` at runtime.
- **FastAPI backend** (`backend/`, uv project) serving the static frontend export at
  `/` plus two stubs, `/api/health` and `/api/me`. Schema init on startup.
- **SQLite** via stdlib `sqlite3` (no ORM — one table). A `users` table, recreated
  empty on every container start because the DB lives in the container's writable
  layer.
- **Single Docker container**, one process, one port (8000). Start/stop scripts for
  mac, linux and windows wrap `docker compose`.

Not built — do not assume otherwise:

- **No AI chat.** Nothing calls an LLM. `OPENROUTER_API_KEY` is unused, and the
  "AI design" section above is a plan, not a description.
- **No authentication.** The login screen at `/` is a placeholder that lets anyone
  through to `/app`. The `users` table is never written to.
- **No document persistence.** Drafts live in React state and are lost on reload.
- **No backend involvement in documents.** Rendering is entirely client-side:
  `frontend/lib/render.ts` substitutes placeholders, `frontend/lib/pdf.tsx` draws the
  PDF with `@react-pdf/renderer`. Both the preview and the PDF share `renderNda`, so
  they cannot drift — keep it that way.

Conventions worth knowing:

- `templates/` is the single source of truth for the corpus.
  `frontend/scripts/copy-templates.mjs` copies what the renderer needs into
  `frontend/public/` at build time; `frontend/public/templates/` is generated and
  gitignored, so never edit it.

Known pre-existing bugs in the MNDA output (untouched by PL-4, which was scoped to
the foundation):

- Every numbered clause renders as "1." in the PDF instead of 1–11.
- The Purpose value is spliced mid-sentence into clause 1, producing ungrammatical
  text.
