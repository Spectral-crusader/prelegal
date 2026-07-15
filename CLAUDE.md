# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

The above describes the **intended** product, and so do the sections below — treat
them as the target design, not a description of what exists. See
[Current implementation](#current-implementation) at the end of this file for what
is actually built.

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
The database uses SQLite and is created from scratch each time the Docker container is brought up. This is deliberate, and PL-7 kept it: accounts and saved documents do not survive a restart.  
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

## Color Scheme
- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)
- Dark Navy: `#032147` (headings)
- Gray Text: `#888888`

Since PL-7 these live as custom properties in `frontend/app/globals.css` (`--navy`,
`--blue`, `--purple`, `--yellow`, `--gray-text`, plus derived hovers and tints) and
every screen styles from them — don't hard-code a hex in a `.module.css`. Accent
yellow is used in exactly one place, the draft disclaimer banner, which is what
keeps it an accent.

## Current implementation

Last updated: PL-7 (2026-07-15). **Keep this section honest** — it is the first thing
read each session, and an inaccurate claim here misleads every future change.

Built:

- **Accounts** (PL-7). Email + password sign up / sign in / sign out. Passwords are
  hashed with stdlib `hashlib.scrypt` (`backend/app/auth.py`) — no password
  dependency. Sessions are opaque random tokens in a `sessions` table, carried in an
  httpOnly cookie, so signing out actually revokes server-side rather than only
  dropping the cookie. `/api/me` is the frontend's guard.
- **Saved documents** (PL-7). Every chat turn upserts a row in `drafts` — document,
  fields, and the transcript — so a reload resumes instead of restarting. `/documents`
  lists them; `/app?draft=<id>` reopens one, conversation and all. The chat route
  appends its own reply before storing, so a restored draft ends on the assistant's
  question rather than stranding the user with nothing to answer.
- **All eleven document types** (PL-6). `/app` is a document-agnostic creator: the
  chat picks the document, then runs its intake, with a live preview and a PDF
  download. `documents.json` at the repo root is the registry — the product's view
  of the corpus that `catalog.json` describes. Adding a document is a registry edit,
  not a code change.
- **Document selection** (PL-6). Before a document is settled the chat runs a
  selection turn against the catalog. Unsupported requests get a plain "we cannot
  draft that", plus the closest supported document **only when one genuinely fits** —
  see the prompt note below. The turn that settles a document immediately runs an
  intake turn on the same history, so one reply both confirms the choice and asks
  the first question, and anything already volunteered is extracted rather than
  re-asked. That is the only turn costing two LLM calls.
- **AI intake chat** (PL-5, generalized by PL-6). `backend/app/chat.py` calls
  `openrouter/openai/gpt-oss-120b` via LiteLLM with Cerebras as the provider, using
  Structured Outputs to return the assistant's reply and the extracted deal terms in
  one call. The schema is built per document from its spec via `create_model`, so
  there is one chat engine, not eleven. The browser owns the live conversation: it
  sends the transcript, the chosen document and the fields so far, and gets back the
  merged fields. The turn is computed purely from the request; the only thing the
  route keeps is the draft it saves (PL-7). There is no form — chat is the only way
  to fill a document.
- **FastAPI backend** (`backend/`, uv project) serving the static frontend export at
  `/` plus `/api/chat`, `/api/documents`, `/api/auth/*`, `/api/me`, `/api/drafts`,
  and `/api/health`. Schema init on startup. Everything except `/api/health` and
  `/api/documents` requires a session — `/api/chat` included, because every turn
  spends real money at OpenRouter.
- **SQLite** via stdlib `sqlite3` (no ORM). Three tables — `users`, `sessions`,
  `drafts` — recreated empty on every container start because the DB lives in the
  container's writable layer. That is why there is no migration story: the schema in
  `db.py` is simply what a fresh database gets.
- **A professional-looking UI** (PL-7). `AppShell` gives every signed-in screen one
  header, nav, sign-out and disclaimer banner, and doubles as the auth guard.
  `AuthForm` backs both `/` and `/signup` — they are the same card with different
  words.
- **Single Docker container**, one process, one port (8000). Start/stop scripts for
  mac, linux and windows wrap `docker compose`.

Not built — do not assume otherwise:

- **Nothing survives a restart.** Accounts and saved documents go with the container,
  by design (PL-7, and the ticket says so explicitly). Do not describe this to a user
  as durable storage; the sign-in screen says as much.
- **No password reset, no email verification, no rate limiting** on sign-in. There is
  no mail path, and accounts are ephemeral anyway. Rate limiting is the one worth
  doing first if this ever holds a real account.
- **The session cookie is not `secure`.** It cannot be: the app is served over plain
  HTTP on localhost, and a secure cookie would never come back. Set it in
  `routes/auth.py` the day this runs behind TLS.
- **No deleting a draft.** The history list only grows. PL-7 left it; the ticket did
  not ask, and `drafts.save` is the only writer.
- **No switching document mid-intake.** Once `documentId` is set every turn is an
  intake turn, so "actually, make it a CSA instead" is not understood — reloading is
  the only way out. Re-running selection each turn would double the LLM calls for a
  rare case, so PL-6 left it; a cheap fix would be a "start over" control in the UI.
- **No backend involvement in *rendering*.** The backend fills fields via the chat,
  but the document itself is still drawn client-side: `frontend/lib/render.ts`
  fills the templates, `frontend/lib/pdf.tsx` draws the PDF with
  `@react-pdf/renderer`. Both the preview and the PDF share `renderDocument`, so
  they cannot drift — keep it that way.
- **No curation beyond the essentials.** Each document's spec names the 6–10
  Variables worth asking about, not every Variable in the template (a PSA has 27).
  The rest are left undefined, which the standard terms define as "not applicable".

Conventions worth knowing:

- **Auth is guarded in the browser, enforced on the server.** A static export has no
  server to redirect at the edge, so `AppShell` asks `/api/me` and bounces a 401 to
  `/`. That guard is a convenience, not a security boundary — it is trivially
  bypassed. Every protected route therefore takes `CurrentUser` and is safe on its
  own. Never let the two drift into one.
- **`drafts.py` never queries without a `user_id`.** Both reads take one and filter on
  it, and `save` scopes its UPDATE by `user_id` as well as `draft_id`, so passing
  someone else's draft id writes a new row rather than over their work.
  `test_drafts.py` pins all three. Keep any new query in that shape.
- **A restored draft must end on the assistant's message.** The chat route appends its
  own reply to the transcript before saving, rather than waiting for the browser to
  send it back next turn. Skip that and a reopened draft ends on the user's message,
  leaving them nothing to answer.
- **`IntakeChat` reads `initialMessages` once, at mount**, so `/app` keys it on the
  draft id. Moving between drafts is a client-side nav that leaves the page mounted;
  without the key the previous conversation stays on screen, and without the state
  reset in the same effect the previous document and fields do too.
- `templates/` is the single source of truth for the corpus.
  `frontend/scripts/copy-templates.mjs` copies it into `frontend/public/` at build
  time; `frontend/public/templates/` is generated and gitignored, so never edit it.
  `documents.json` reaches the image via a `COPY` in the Dockerfile.
- **Two renderers, deliberately.** The Mutual NDA is the only document in the corpus
  shipping a real cover page, with checkbox options; `renderNda` handles it and stays
  bespoke. Every other template is Standard Terms that leaves its Variables
  capitalized in the prose for a cover page to define — each says so itself, e.g.
  Pilot §8.1: *"if the Order Form omits or does not define a Variable, the default
  meaning will be 'none' or 'not applicable'"*. So `renderGeneric` does **not**
  substitute values into the sentences; it unwraps the Variable spans and synthesizes
  the Key Terms cover page the terms are asking for. Splicing values inline instead
  produces ungrammatical text ("within a single 12 months") and possessive-form bugs.
- **A field's `label` must match its Variable in the template**, because that is what
  ties a Key Terms row to the prose using it. `test_documents.py` enforces this.
- **Two field shapes, deliberately.** `Fields` (all nullable) is what the user has
  told the AI; the MNDA's `MndaFormValues` (fully populated) is what its renderer
  needs. `toMndaFormValues` in `frontend/lib/types.ts` is the only bridge. Nulls are
  what let the AI know what to ask next, so don't collapse the two.
- **`requiredWhen` exists for a reason.** `termYears` is optional in general but
  required when `termMode` is `years`; without the rule, `toMndaFormValues`'s
  fallback would quietly issue a 1-year NDA to someone who chose a fixed term but
  never said how long. Same class of trap as the `effectiveDate` comment.
- **The selection prompt must not always offer an alternative.** Told to offer the
  closest document unconditionally, the model suggested adapting a Professional
  Services Agreement into a residential lease, and a partnership agreement into a
  prenup — confident, useless, and close to the legal advice it is told not to give.
  The prompt now says to offer one only when it genuinely fits, and otherwise to
  stop. Keep both halves: without the counterweight it refuses everything and stops
  offering the PSA to someone papering a freelance engagement, which the ticket asks
  for.
- **Never put `lineHeight` on the PDF `Page` style.** It did nothing there —
  @react-pdf 4.5.1 does not inherit it to the text — while silently breaking the
  `fixed` footer, which simply never drew, and past two pages threw "unsupported
  number: -9.09e21" from a garbage y coordinate. That is why PL-6's longer documents
  crashed the PDF and why no prelegal PDF has ever had a page footer. Measured
  against the library alone: lineHeight on the Page gives 0 footers on 3 pages,
  without it 6 of 6. If you want looser lines, set it on the text styles.
- **The PDF list parser takes numbers from the source**, not from position — the
  corpus separates clauses with blank lines, so position-derived numbering made every
  clause render as "1.". It also has to handle indented sub-items (`    1.`, `a.`),
  which nine of the templates use.
- **`reasoning_effort` is `"medium"`, not the skill's `"low"`.** At low effort the
  model replies with a bare acknowledgement and forgets to ask the next question
  (measured 1/5 vs 5/5 at medium). Don't lower it without re-checking that.
- **Python is pinned to 3.13** (`backend/.python-version`, and `<3.14` in
  `pyproject.toml`). litellm ships a Rust extension with wheels only up to cp313; on
  3.14 uv builds from sdist and cargo fails. This matches the `python:3.13-slim` image.
- **`OPENROUTER_API_KEY` reaches the container via `env_file: .env`** in
  `docker-compose.yml`. `.env` is both git- and docker-ignored, so it is never baked
  into the image; `config.py` loads it for local dev.

Known bugs in the rendered output:

- The Purpose value is spliced mid-sentence into MNDA clause 1, producing
  ungrammatical text ("in connection with the Evaluating a partnership which…").
  Pre-existing; PL-6 was scoped away from it.
- Markdown links inside an italic run render as literal `[CC BY 4.0](https://…)` in
  the PDF, because `parseInline` matches the italic first and does not recurse. Hits
  the attribution line on every document. Cosmetic, pre-existing.
- ~~Every numbered clause renders as "1."~~ — fixed in PL-6.
