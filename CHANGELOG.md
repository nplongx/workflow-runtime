# Changelog

## 0.2.3

- Refresh the immutable Execution Runtime dependency to 0.1.2, including the extracted Provider Admission owner.
- Keep Workflow's shared-connection transaction and task/event ownership unchanged.

## 0.2.2

- Move Execution state/persistence schema and SQL implementations into the standalone `@runalith/execution-runtime` package.
- Keep compatibility re-exports for previous Workflow Runtime public Execution symbols and module paths.
- Declare immutable GitHub dependencies for Execution Runtime and Workflow Contracts; clean installs no longer rely on a parent checkout.

## 0.2.1

- Expose one-time host injection for typed action-intent semantic verification through the public Workflow Plan module, sharing the exact verifier instance used by `validateExecutionPlan`.

## 0.1.0

- Initial Workflow Runtime source extraction.
- Side-effect-free imports and lazy legacy singleton.
- Explicit SQLite initialization and injected-connection support.
- Versioned Workflow/Execution state ports and participants.
- Production QA harness dependency is host-injected and digest-pinned.
- Expanded README, architecture, database integration, terminology, source-lineage, and security documentation.

## 0.2.0

- Exported frozen Workflow Plan API v1 from the package root and `./workflow-plan` subpath.
- Added packed-consumer coverage for the independent plan API subpath.
