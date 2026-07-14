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
- [ ] Scope & feature set finalized
- [ ] Core implementation
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