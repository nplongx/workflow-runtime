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
| src/runtime/workflow/ | Workflow definitions/catalogs, roles and agent contracts, plan compiler, policy/success contracts, evidence, and workspace-write contracts. | Durable artifact DTO/hash/validation is delegated to Workflow Contracts; definitions and validators do not independently authorize host actions. |
| src/runtime/workflow/phases.js | Frozen Workflow phase identifiers and production phase order. | Public `./phases` subpath exposes constants only; it does not perform or authorize transitions. |
| src/runtime/workflow/artifact-normalizer.js | Pure parsing/normalization of reviewer artifact text into the required review DTO. | Public `./artifact-normalizer` subpath; consumes Workflow Contracts strict JSON parser and has no trust, approval, DB or lifecycle authority. |
| src/runtime/workflow/artifacts.js | Compatibility re-export for durable artifact DTOs, hashing and validation. | `@runalith/workflow-contracts` is the sole implementation owner; WorkflowStore retains selection, persistence and transaction authority. |
| src/runtime/workflow/success-contract.js | Normalize immutable success predicates; evaluate detached plan/task/artifact data and reviewer assessment. | Public `./success-contract` subpath; caller supplies all read models; no DB, reviewer trust, approval, event writes or terminalization. |
| src/runtime/workflow/roles.js | Frozen task capability vocabulary and built-in Workflow role contracts. | Public `./roles` subpath exposes descriptors/validation only; assignment, authorization, approval and dispatch remain host/Workflow-owned. |
| src/runtime/workflow/role-profiles.js | Version-pinned custom role profile binding resolution, snapshot hashing and built-in task-role overlay validation. | Public `./role-profiles` subpath reads through a caller-owned DB handle; overlays exclude permission/tool grants and do not assign roles or authorize execution. |
| src/runtime/workflow/evidence.js | Canonical durable execution-evidence formatting and validation over detached task/result/plan read models. | Public `./evidence` subpath; no DB/provider access or persistence. Host selects trusted rows and retains Workflow result/terminalization authority. |
| src/runtime/workflow/workspace-write-contract.js | Normalize the supported standard-engineering v3 `workspace.write` operation and validate role-specific path scopes against the caller's existing workspace. | Public `./workspace-write-contract` subpath. It does not grant capabilities, approve a plan, persist receipts or mutate files. `WorkspaceWriteCapabilityService` retains writer-lock, approval, atomic replacement and receipt/event authority. |
| src/runtime/workflow/agent-contracts.js | Validate compiled action-intent task/role contract identity, source lineage, dependency IDs and typed input bindings; hold the one-time host semantic-verifier callback. | Public `./agent-contracts` subpath. `configureCompiledActionIntentSemanticVerifier` must receive the host-owned AGG verifier once; package does not implement AGG semantics or issue approval/dispatch authority. `./workflow-plan` and `./agent-contracts` resolve the same module instance. |
| src/runtime/workflow/definitions/*.js | Immutable built-in Workflow identity/version/phase/required-child declarations and definition lookup helpers. | Public `./workflow-definitions/*` subpaths expose the exact internal module instances. No transition, approval, policy persistence or task execution authority. |
| src/runtime/workflow/catalog/{engineering,hybrid-engineering,standard-engineering}.js | Deterministic task spec and dependency builders for supported built-in workflows. | Public `./workflow-catalog/*` subpaths expose the exact internal module instances. Production QA catalog remains host-bound because its digest-pinned harness resolves against the host plugin root. |
| src/runtime/agent-contracts-public-api.js | Compatibility re-export of generic Agent role/action-intent vocabulary. | Canonical implementation is `@runalith/agent-contracts`; AGG compiled semantic validation remains composition-injected. |
| src/runtime/secure-filesystem.js | Compatibility re-export of descriptor-anchored filesystem primitives. | Canonical implementation is `@runalith/workspace-runtime/filesystem`; no duplicate filesystem algorithm remains in Workflow Runtime. |
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

The runtime uses Node.js built-ins and two immutable GitHub-pinned Runalith dependencies: `@runalith/workflow-contracts` for pure strict-JSON/DTO helpers and `@runalith/execution-runtime` for Execution-owned persistence stores, ports, participants and provider-dispatch identity. COS-AP v1 remains mirrored for Workflow/MCP wire compatibility. Workflow Runtime does not contain the physical Execution SQL owner implementation; its local paths are compatibility re-exports from Execution Runtime. Cross-domain transactions still use the caller-owned shared SQLite connection and remain coordinated by Workflow.

## Workflow Plan API v1

The immutable execution-plan normalizer is exported from `@runalith/workflow-runtime/workflow-plan` as a frozen four-method API: canonical JSON, plan validation, persisted dependency assertion and batch-route resolution. It is pure with respect to persistence: consumers supply plan/task values, and no database handle or generic transaction surface is exposed. AGG/evidence integrations should use this public API rather than import monolith-local plan modules.

Typed action-intent semantic validation is host-owned. A composing host configures its verifier through the package's one-time `configureCompiledActionIntentSemanticVerifier` export; this ensures the callback is attached to the same module instance used by the public `validateExecutionPlan`. The verifier is not an authorization grant and cannot replace the separate owner-approval/dispatch gates.
