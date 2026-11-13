# Architecture and ownership

## Components

- WorkflowStoreCore: Workflow jobs, proposals, approvals, immutable plans, tasks, artifacts, events, reports and terminal lifecycle.
- WorkflowDatabase: explicit SQLite opening, path validation, private-directory enforcement and schema migrations.
- WorkflowStatePort v2: in-process named Workflow coordination API.
- ExecutionStateStore v1: DDL, read models and typed DML for attempts, results, batches, batch items and checkpoints.
- ExecutionStatePort v1: frozen read-only Execution API.
- ExecutionStateParticipant v1: frozen typed-write participant inside Workflow transactions.
- ExecutionPersistenceStore/Port/Participant v1: provider run and dispatch intent persistence.
- RunalithWorkflowStore: host composition adds Agent Session store/API and Execution persistence participant on the same SQLite connection.

## Transaction invariant

Workflow owns transaction/savepoint boundaries. Execution participants run typed statements only; they cannot begin, commit, roll back or accept caller SQL. Cross-domain preflight, events, task/lease mutations remain in the Workflow transaction. No independent DB split exists.

## Database invariant

Importing package entrypoints performs no database filesystem mutation. Host explicitly calls `openWorkflowDatabase()` or supplies an existing SQLite connection. Directory/file security checks apply when runtime opens its own database. Injected connections remain host-owned.

## Host dependencies

Trust verifier is host-provided. Production QA harness requires explicit host root or compatible source layout and keeps SHA-256 pin. COS-AP v1 source mirror keeps package self-contained.

## Workflow Plan API v1

The immutable execution-plan normalizer is exported from `@runalith/workflow-runtime/workflow-plan` as a frozen four-method API: canonical JSON, plan validation, persisted dependency assertion and batch-route resolution. It is pure with respect to persistence: consumers supply the plan/task values, and no database handle or generic transaction surface is exposed. AGG/evidence integrations should consume this public API rather than import the monolith-local plan module.
