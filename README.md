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

## License

[MIT](./LICENSE)

## Frontend (prototype)

The `frontend/` directory contains a Next.js 15 (App Router) prototype for
[PL-3](../../issues/PL-3): the Mutual NDA Creator. It is a single-page app
where the user fills in the deal terms (purpose, effective date, MNDA term,
term of confidentiality, governing law, jurisdiction, optional modifications),
sees a live preview of the rendered Common Paper Mutual NDA, and downloads a
print-ready PDF generated server-side with `@react-pdf/renderer`.

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # strict TypeScript
npm run lint         # ESLint (next/typescript)
npm run build        # production build
npm run start        # production server
```

PDF rendering lives in `frontend/app/api/render-pdf/route.tsx`; the
server-side renderer is in `frontend/lib/render.ts` and a matching
client-side mirror used for the live preview is in
`frontend/lib/render-client.ts`. Source Markdown for the MNDA is bundled at
`frontend/lib/templates/__assets/` (a copy of `templates/Mutual-NDA*.md`).

This app is intentionally minimal — see `frontend/lib/render.ts` for the
placeholder-substitution logic. A future FastAPI backend (per the README
roadmap) will own the template corpus and feed the renderer.