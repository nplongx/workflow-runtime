# Changelog

## 0.2.6

- Refresh immutable Execution Runtime dependency to 0.1.6 so Workflow Runtime shares the host’s exact provider-adapter package version.
- Keep Workflow lifecycle, lease, event and cross-domain transaction authority in Workflow Runtime; Gateway Specialist Adapter consumes WorkflowStatePort v2.

## 0.2.5

- Refresh the immutable Execution Runtime dependency to 0.1.5, which now contains the deterministic in-memory runner provider used by the legacy M11 host adapter.
- Preserve Workflow transaction ownership and same-connection fences; no Workflow task/lease/event API moved into Execution Runtime.

## 0.2.4

- Refresh the immutable Execution Runtime dependency to 0.1.4 so the host and Workflow Runtime share one deduplicated package version.
- Preserve Workflow transaction ownership; GitHub Actions provider code remains an Execution Runtime adapter using injected WorkflowStatePort v2.

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
