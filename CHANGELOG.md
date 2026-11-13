# Changelog

## 0.3.3

- Expose version-pinned custom role profile binding, snapshot hashing and task-overlay validation through `@runalith/workflow-runtime/role-profiles`.
- Align custom-role persistence reads with the host's public Workflow Contracts parser and Agent Runtime Skills importer; pin Agent Runtime to its CI-verified immutable commit.
- The role-profile API accepts a caller-owned database connection and only reads persisted custom role versions; it does not open a database, grant permissions, assign roles, approve, or dispatch work.

## 0.3.2

- Expose immutable Workflow task-capability constants and built-in role contract validation through `@runalith/workflow-runtime/roles`.
- Keep role vocabulary and contract definitions byte-identical to the package-owned implementation already used by Workflow catalogs.
- No database, role assignment, approval, tool grant, dispatch or execution authority is introduced by the public constants API.

## 0.3.1

- Expose pure Success Contract normalization, predicate evaluation and assessment validation through `@runalith/workflow-runtime/success-contract`.
- Reuse strict JSON parsing from the public Workflow Contracts package.
- Keep all durable task/artifact reads, reviewer trust, approval, event writes and Workflow terminalization in host/WorkflowStore authority.

## 0.3.0

- Expose pure reviewer-artifact normalization/parsing through `@runalith/workflow-runtime/artifact-normalizer`.
- Make the normalizer consume the public Workflow Contracts strict JSON parser.
- Preserve reviewer schema validation; no reviewer identity, approval, task lifecycle, database or transaction authority moves.

## 0.2.9

- Export the immutable Workflow phase vocabulary through the explicit `./phases` public subpath.
- Keep phase identifiers and production phase ordering byte-identical to the existing package-owned source.
- Preserve all Workflow lifecycle, state mutation, approval, task, lease and event authority in Workflow Runtime.

## 0.2.8

- Refresh immutable Execution Runtime dependency to 0.1.8, which owns bounded exit-marker observation and pure execution-batch retry-lineage verification.
- Keep event retrieval and Workflow transaction boundaries in Workflow Runtime / host WorkflowStatePort.

## 0.2.7

- Refresh immutable Execution Runtime dependency to 0.1.7, which owns the extracted ProviderDispatchScheduler used by the legacy host scheduler adapter.
- Preserve Workflow transaction, lease, task and event authority; scheduler receives WorkflowStatePort v2 and ExecutionPersistencePort v1.

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
