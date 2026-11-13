# Changelog

## 0.1.0

- Initial Workflow Runtime source extraction.
- Side-effect-free imports and lazy legacy singleton.
- Explicit SQLite initialization and injected-connection support.
- Versioned Workflow/Execution state ports and participants.
- Production QA harness dependency is host-injected and digest-pinned.

## 0.2.0

- Exported frozen Workflow Plan API v1 from the package root and `./workflow-plan` subpath.
- Added packed-consumer coverage for the independent plan API subpath.
