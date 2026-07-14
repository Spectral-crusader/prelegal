# prelegal

A pre-legal intake and document-screening tool.

> ⚠️ **Work in progress.**
> This project is under active development.
> **Target completion: 2026-07-21** (≈1 week from 2026-07-14).
> Until then, expect missing features, breaking changes, and incomplete documentation.
> Nothing here constitutes legal advice.

## Status

- [x] Repository bootstrapped
- [x] License declared (MIT)
- [x] Legal template dataset imported from Common Paper (see `templates/` and `catalog.json`)
- [x] **PL-3** — Mutual NDA Creator prototype (Next.js app in `frontend/`)
- [x] **PL-4** — V1 technical foundation (FastAPI backend, SQLite, Docker, scripts)
- [ ] Scope & feature set finalized
- [ ] Core implementation (beyond the prototype)
- [ ] Tests
- [ ] Documentation
- [ ] First stable release

## Template dataset

`templates/` contains a curated set of standard legal agreement templates
sourced from [Common Paper](https://commonpaper.com). `catalog.json` lists
each template with its name, description, and filename.

The templates are released under [CC BY 4.0](./templates/LICENSE) and may be
freely used and modified with attribution.

For the current task list, see the [open issues](../../issues).

## Roadmap to first release

Roughly the next 7 days:

1. **Scope** — finalize what prelegal does in v0.1 (intake form? document parser? jurisdiction lookup?).
2. **Core build** — implement the smallest useful end-to-end flow.
3. **Tests** — at least smoke coverage on the core path.
4. **Docs** — flesh out this README with install/run instructions and a usage example.
5. **Release** — tag `v0.1.0`.

## Running it

The whole stack is one Docker container: FastAPI serves the API and the
statically exported frontend on a single port.

```bash
# Mac
scripts/start-mac.sh      # http://localhost:8000
scripts/stop-mac.sh

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1
```

The SQLite database lives inside the container, so every start comes up with an
empty schema.

## Architecture

- **`backend/`** — a [uv](https://docs.astral.sh/uv/) project running FastAPI. It
  exposes `/api/health` and `/api/me`, initializes the SQLite schema on startup,
  and serves the frontend export at `/`.
- **`frontend/`** — Next.js 15 (App Router), built with `output: 'export'` to plain
  HTML/JS. No Node process at runtime.
- **`templates/`** — the single source of truth for the template corpus.
  `frontend/scripts/copy-templates.mjs` copies what the renderer needs into
  `frontend/public/` at build time.

The current product surface is the [PL-3](../../issues/PL-3) Mutual NDA Creator at
`/app`: fill in the deal terms, see a live preview, download a print-ready PDF.
Rendering runs entirely in the browser — `frontend/lib/render.ts` does the
placeholder substitution and `frontend/lib/pdf.tsx` draws the PDF with
`@react-pdf/renderer`. Both the preview and the PDF share `renderNda`, so they
cannot drift.

The login screen at `/` is a placeholder: authentication is not implemented, and
any details take you through to the platform.

### Development

```bash
cd backend
uv run pytest                                  # backend tests
uv run uvicorn app.main:app --port 8000        # serves frontend/out if built

cd frontend
npm install
npm run build        # static export to frontend/out
npm run dev          # http://localhost:3000 (frontend only)
npm run typecheck    # strict TypeScript
npm run lint         # ESLint (next/typescript)
```

## License

[MIT](./LICENSE)