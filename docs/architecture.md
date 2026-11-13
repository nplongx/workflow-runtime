# Architecture and ownership

## Purpose

@runalith/workflow-runtime is a local-first persistence and orchestration library for a host that needs durable Workflow and Agent Session state. The package owns one SQLite schema and a set of typed, in-process APIs. It does not create a network boundary or a separate process for each subsystem.

The host chooses whether to open the database through openWorkflowDatabase() or inject a compatible SQLite connection. Workflow remains the transaction owner for state transitions spanning multiple domains.

## Component view

~~~mermaid
flowchart TD
    Host[Host application] --> DB[openWorkflowDatabase or injected SQLite]
    DB --> Runtime[RunalithWorkflowStore composition]
    Runtime --> Workflow[WorkflowStoreCore]
    Runtime --> Session[Agent Session store and API]
    Runtime --> Exec[Execution state store]
    Runtime --> Persist[Execution persistence store]
    Workflow --> Tx[Workflow-owned SQLite transaction/savepoint]
    Session --> Tx
    Exec --> Tx
    Persist --> Tx
    Runtime --> Ports[Versioned in-process ports and participants]
    Ports --> Host
    Host --> Authority[Host-owned identity, trust, verifier, provider and executor]
~~~

The port interfaces are boundaries inside one process and one database. They are not message protocols, RPC APIs, or evidence that the participating domains can be deployed independently.

## Module map

| Surface | Responsibility | Boundary |
|---|---|---|
| index.js | Supported package entrypoint and public exports. | Prefer this over imports from src/. |
| src/runtime/job-store.js | WorkflowStoreCore: Workflow lifecycle, proposals, approvals, plans, tasks, leases, artifacts, reports, events, and core projections. | Uses Workflow-owned schema and transaction logic. |
| src/runtime/workflow-database.js | Resolve database path, open a file-backed SQLite connection, validate filesystem identity/permissions, initialize schema. | Explicit open operation; import alone does not create or modify files. |
| src/runtime/runalith-runtime-composition.js | Compose Workflow, Execution persistence, and Agent Session on one connection; expose the lazy legacy singleton. | No independent database per domain. |
| src/runtime/workflow-state-port.js | WorkflowStatePort v2, named in-process Workflow coordination methods. | No generic SQL or transaction callback is exposed by the port. |
| src/runtime/workflow-control-port.js | WorkflowControlPort v1, narrow lifecycle/control queries and commands. | Frozen named-method facade. |
| src/runtime/execution-state-store.js | DDL, read models, and typed writes for attempts, results, execution batches/items, and checkpoints. | Shares Workflow's SQLite connection. |
| src/runtime/execution-state-port.js | ExecutionStatePort v1, frozen read-only projections. | No database handle or write methods. |
| src/runtime/execution-state-participant.js | ExecutionStateParticipant v1, typed write operations. | Called within an outer Workflow transaction. |
| src/runtime/execution-persistence-store.js | Provider run and provider dispatch-intent schema, queries, reservations, outcomes, and reconciliation bindings. | Does not call a provider or authorize replay. |
| src/runtime/execution-persistence-port.js | ExecutionPersistencePort v1, immutable named provider-ledger API. | No database handle or generic transaction callback. |
| src/runtime/execution-persistence-participant.js | Read-only provider-persistence participant used by Workflow reconciliation paths. | Same connection; Workflow retains transaction ownership. |
| src/runtime/agent-session-store.js | Agent Session, session access, message queue, delivery state, and receipt persistence. | Uses the injected Workflow database. |
| src/runtime/agent-session-api.js | Versioned Agent Session API and lifecycle participant contracts. | In-process API; not a transport or identity provider. |
| src/runtime/workflow/ | Workflow definitions/catalogs, roles and agent contracts, plan compiler, policy/success contracts, artifacts, evidence, and workspace-write contracts. | Definitions and validators do not independently authorize host actions. |
| src/runtime/owner-approval-contract.js | Versioned owner-approval vocabulary and canonical JSON/digest helpers. | No private keys, trust roots, or signature verifier. |
| src/runtime/workflow/catalog/production.js | Production workflow task definitions and host QA harness acceptance checks. | Harness files are host-supplied and digest-pinned. |

## Data flow

1. The host opens a private file-backed database or constructs a compatible connection and injects it.
2. RunalithWorkflowStore initializes Workflow-owned schema and composes Execution persistence and Agent Session against that exact connection.
3. Workflow operations create and update durable jobs, proposals, immutable plan snapshots, tasks, leases, events, artifacts, and reports.
4. Execution state is read through ExecutionStatePort v1; typed writes are performed through ExecutionStateParticipant v1 inside Workflow-owned transactions.
5. Provider dispatch intents and provider-run observations are stored by the Execution persistence domain. A host adapter performs external provider calls and reports their outcomes.
6. Agent Session operations use the same database. Workflow can participate in session lifecycle and delivery transitions through explicit hooks so related state changes remain atomic.
7. The host reads durable state and decides when to schedule, dispatch, execute, reconcile, notify, or recover.

## Transaction invariants

- Workflow owns BEGIN IMMEDIATE, transaction, and savepoint boundaries for cross-domain state transitions.
- Execution state participants issue named statements only. They do not open, commit, or roll back transactions.
- Agent Session lifecycle and delivery hooks participate in the same SQLite transaction when invoked by Workflow.
- Composed stores must share the exact same connection object. Mixing separate SQLite handles breaks the intended atomicity contract.
- A port is not an independent service. It is an API boundary for code running in the same process.

## Database invariants

- Importing the package entrypoint does not create directories, open SQLite, change permissions, or run migrations.
- openWorkflowDatabase() explicitly opens the host database and applies filesystem checks before and after opening it.
- initializeWorkflowDatabase(database) initializes a caller-supplied connection; the caller retains ownership and must close it.
- The legacy workflowStore export is a lazy proxy. Its first property access or method call creates the default file-backed database.
- SQLite WAL mode, foreign-key enforcement, and a 5-second busy timeout are configured by initialization.
- Schema initialization contains additive migrations for earlier supported layouts. Back up durable data before upgrading.

## Trust and execution boundaries

- Owner-approval serialization and digest functions are pure protocol helpers. The host supplies setOwnerApprovalVerifier() and is responsible for authenticated owner identity, trusted public keys, trust-root lifecycle, and key rotation.
- The current OWNER_APPROVAL_ALLOWED_ACTION_IDS list is empty. The package therefore fails closed before a concrete action can be accepted for owner-approved dispatch.
- Production QA uses an explicit host root or a compatible source layout. The harness file is checked against a pinned SHA-256 value and required output markers. The package does not ship the parent application's QA harness.
- Provider intent persistence does not make a network request, guarantee remote idempotency, or establish that an external operation completed.
- A stored attempt or cleanup observation is not proof that an external provider or remote worker stopped.
- Workflow definitions, policy values, role contracts, hashes, and capability-shaped records do not replace host authorization.

## Dependencies

The runtime uses Node.js built-ins, including node:sqlite, and has no third-party runtime dependency or sibling-package dependency. The versioned COS-AP v1 contract source is mirrored under protocol/cos-ap-v1/ to keep this checkout self-contained.
