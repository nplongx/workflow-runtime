# Workflow Runtime

[![CI](https://github.com/nplongx/workflow-runtime/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nplongx/workflow-runtime/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**@runalith/workflow-runtime** is a Node.js ESM library for durable, local-first workflow state. It provides Workflow lifecycle and plan storage, tasks and leases, approvals and event history, artifacts and reports, execution/attempt records, provider-dispatch persistence, and Agent Session orchestration on SQLite.

It is a composable runtime library, not a network service or a self-running workflow platform. The host application remains responsible for authenticated identity, trust configuration, provider calls, process execution, scheduling, external side effects, and operational recovery.

> **Status:** 0.3.8, GitHub-first source package. Not published to npm. Public APIs and storage/migration compatibility remain pre-1.0.

## Scope

- Durable Workflow/Job lifecycle, immutable plan snapshots, task state, leases, event journal, artifacts, reports, and workflow runtime state.
- Versioned in-process coordination contracts: WorkflowStatePort v2, WorkflowControlPort v1, and Execution ports/participants v1.
- Execution attempts, results, execution batches/items, and checkpoints.
- Provider run and dispatch-intent records, including unresolved-outcome and reconciliation state.
- Agent Session records, access grants, message queues, delivery claims, receipts, and lifecycle hooks.
- Workflow definitions, role/agent contracts, plan compilation and policy; pure artifact DTO/hash/validation is delegated to Workflow Contracts, while Workflow Runtime owns evidence normalization and lifecycle orchestration.
- Immutable phase identifiers and production phase ordering through `@runalith/workflow-runtime/phases`.
- Pure reviewer-artifact normalization and schema parsing through `@runalith/workflow-runtime/artifact-normalizer`.
- Durable artifact DTOs, content hashing and validation are consumed from `@runalith/workflow-contracts`; Workflow Runtime's internal `workflow/artifacts.js` path remains a compatibility re-export only.
- Pure immutable Success Contract normalization and predicate/assessment validation through `@runalith/workflow-runtime/success-contract`.
- Immutable built-in Workflow role capability vocabulary and validation through `@runalith/workflow-runtime/roles`.
- Version-pinned custom role profile bindings, profile hashes and task overlay validation through `@runalith/workflow-runtime/role-profiles`.
- Pure durable execution-evidence construction and validation through `@runalith/workflow-runtime/evidence`.
- Workflow `workspace.write` contract normalization and read-only scope validation through `@runalith/workflow-runtime/workspace-write-contract`.
- Compiled Agent Contract structure checks and one-time AGG semantic-verifier injection through `@runalith/workflow-runtime/agent-contracts`; AGG semantic implementation remains injected by the host.
- Immutable built-in Workflow descriptors through `./workflow-definitions/*` and standard/engineering/hybrid task-spec builders through `./workflow-catalog/*`; production QA harness catalog remains host-bound.
- Canonical Agent role/action-intent vocabulary comes from Agent Contracts; descriptor-anchored filesystem operations come from Workspace Runtime.
- Explicit SQLite opening or caller-supplied SQLite connection; no implicit database creation on package import.

## Non-goals

This package does not provide an HTTP/MCP server, authentication provider, trust-root or private-key manager, provider transport, OS process executor, distributed scheduler, distributed transaction protocol, or remote database service. The package persists intent and observations; it does not perform provider network calls or independently prove that remote work stopped.

## Install

Install directly from GitHub:

~~~sh
npm install github:nplongx/workflow-runtime
~~~

Requirements:

- Node.js >=22.13.0.
- Built-in node:sqlite.
- Local filesystem for a file-backed SQLite database.

The runtime uses Node.js built-ins plus explicit public Runalith dependencies: `@runalith/agent-contracts` for canonical Agent role/action-intent vocabulary, `@runalith/agent-runtime` for Agent Skills ingestion, `@runalith/workspace-runtime` for descriptor-anchored filesystem primitives, `@runalith/workflow-contracts` for strict JSON/artifact DTO/JCS policy primitives, and `@runalith/execution-runtime` for Execution-owned persistence stores, Provider Admission, GitHub Actions Runner Admission, provider transport, ProviderDispatchScheduler, execution observation helpers, ports, participants and provider-ledger identity. COS-AP v1 remains mirrored for Workflow/MCP wire compatibility. Dependencies are pinned to immutable GitHub commits in the lockfile; no parent application checkout is required.

Execution table DDL and SQL primitives no longer live in Workflow Runtime. Workflow imports the public Execution Runtime API and keeps only the existing transaction coordination around task/job/event state. Workflow remains the current transaction coordinator for cross-domain atomicity; the new repository does not imply an independent DB or process.

## Quick start

Use an in-memory database for a smoke test or isolated test:

~~~js
import { DatabaseSync } from 'node:sqlite';
import { createRunalithWorkflowStore } from '@runalith/workflow-runtime';

const database = new DatabaseSync(':memory:');

try {
  const runtime = createRunalithWorkflowStore(database);
  const job = runtime.createJob({
    conversationKey: 'example-conversation',
    title: 'Prepare a design',
  });
  const task = runtime.ensureTask(job.job_id, {
    role: 'architect',
    description: 'Create the design artifact',
  });

  const session = runtime.agentSessions.createAgentSession(task.task_id, {
    sessionKey: 'agent:design',
    role: 'architect',
  });

  console.log({ jobId: job.job_id, taskId: task.task_id, sessionId: session.session_id });
} finally {
  database.close();
}
~~~

The injected connection is shared by Workflow, Execution persistence, and Agent Session composition. The host owns its lifetime and closes it.

## File-backed database

For a host-managed local database, open it explicitly:

~~~js
import {
  openWorkflowDatabase,
  createRunalithWorkflowStore,
} from '@runalith/workflow-runtime';

const { database, dbPath } = openWorkflowDatabase({
  environment: {
    ...process.env,
    WORKFLOW_DB: '/var/lib/my-service/workflow/workflow.db',
  },
});

try {
  const runtime = createRunalithWorkflowStore(database);
  console.log({ dbPath, stats: runtime.getStats() });
} finally {
  database.close();
}
~~~

openWorkflowDatabase() resolves and validates the database path, creates a private parent directory when needed, opens SQLite, enables foreign keys/WAL/busy timeout, and applies Workflow-owned schema initialization and migrations. On POSIX systems, the final database directory must be owned by the runtime user and mode 0700; database file permissions are secured to 0600. Ancestor directories are checked for replaceable writable paths.

Path configuration:

| Setting | Behavior |
|---|---|
| WORKFLOW_DB | Explicit database file path. Takes precedence over WORKFLOW_DATA_DIR. |
| WORKFLOW_DATA_DIR | Database directory when WORKFLOW_DB is not set. |
| neither set | Defaults to process.cwd()/data/workflow.db. |

See [Database integration](docs/integration.md) before using an existing database or deploying a persistent host.

## Composition and transaction ownership

- WorkflowStoreCore is the base Workflow store.
- RunalithWorkflowStore (also exported as WorkflowStore) composes Workflow, Agent Session, Execution state, and provider-persistence participants.
- All composed domains use the same SQLite connection.
- Workflow owns transaction/savepoint boundaries. Execution participants expose named typed operations; they do not receive generic SQL or transaction controls.
- WorkflowStatePort v2 is an in-process coordination boundary, not an RPC interface or separate datastore.
- ExecutionStatePort v1 is frozen/read-only. ExecutionStateParticipant v1 exposes typed writes inside Workflow-owned transactions.
- ExecutionPersistencePort v1 exposes provider-ledger operations. The persistence participant supports Workflow-owned reconciliation reads on the same connection.

This is one local SQLite transaction unit. It is not a distributed transaction or independent service boundary.

## Approval and trust status

Owner-approval contract constants and canonical serialization are included, but signature verification and trust-root management remain host-owned. The host must configure setOwnerApprovalVerifier() with an independently trusted verifier; missing verifier fails closed.

**Current release limitation:** OWNER_APPROVAL_ALLOWED_ACTION_IDS is intentionally empty. The current owner-approval expectation builder rejects every action identifier, so an immutable plan cannot currently become owner-approval-ready for dispatch. Do not treat the presence of approval APIs or contract constants as a usable approval/dispatch authorization path. See [Security policy](SECURITY.md).

## Documentation

- [Documentation index](docs/README.md)
- [Architecture and module boundaries](docs/architecture.md)
- [Database integration and lifecycle](docs/integration.md)
- [Terminology](docs/terminology.md)
- [Source lineage and extraction boundary](docs/source-lineage.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [Pinned source manifest](docs/source-manifest.json)

## Workflow phase constants

Import the immutable vocabulary from the explicit subpath:

~~~js
import { WorkflowPhase, PRODUCTION_PHASES } from '@runalith/workflow-runtime/phases';

if (runtime.phase === WorkflowPhase.RUN_CHILDREN) {
  // Host/scheduler owns the decision and any resulting side effects.
}
~~~

`WorkflowPhase` and `PRODUCTION_PHASES` are frozen constants, not state-machine executors. The package exposes the exact source already used internally by Workflow definitions; it does not authorize or perform phase transitions. Transition persistence and transaction ownership remain in Workflow Runtime/host WorkflowStore.

## Reviewer artifact normalization

~~~js
import { normalizeReviewerArtifact, parseReviewerArtifact } from '@runalith/workflow-runtime/artifact-normalizer';

const normalizedJson = normalizeReviewerArtifact(rawProviderText);
const review = parseReviewerArtifact(rawProviderText);
~~~

This pure input utility extracts and validates the stable reviewer-artifact shape from raw provider text or nested text wrappers. It returns normalized JSON or `null`; it does not authenticate a reviewer, verify signatures, record approval, write artifacts, or authorize task completion. Trust identity, reviewer attestations and Workflow approval remain host-owned.

## Success Contract evaluation

~~~js
import {
  normalizeSuccessContract,
  validateSuccessContract,
  evaluateSuccessPredicate,
  validateSuccessAssessment,
  successContractPrompt
} from '@runalith/workflow-runtime/success-contract';

const contract = normalizeSuccessContract({ goal: 'Complete local validation.' });
const valid = validateSuccessContract(contract);
const predicate = evaluateSuccessPredicate({ id: 'build-complete', type: 'all_tasks_completed' }, {
  plan: { children: [{ id: 'build' }] }, tasks: [{ metadata_json: '{"workflow_plan_task_id":"build"}', status: 'completed' }]
});
~~~

This subpath accepts detached plan/task/artifact read models. It normalizes immutable success predicates and evaluates a supplied reviewer assessment against those inputs. It does not fetch durable task/artifact state, authenticate reviewers, grant approval, write events, or mark a workflow terminal. The host remains responsible for selecting verified active evidence and persisting the result inside the correct Workflow transaction.

## Built-in role contracts

~~~js
import {
  TaskCapability,
  ROLE_CONTRACTS,
  getRoleContract,
  validateRoleContract
} from '@runalith/workflow-runtime/roles';

const engineer = validateRoleContract('engineer', { capability: TaskCapability.CODE_MODIFY });
~~~

The subpath exposes frozen task capability values and the built-in Workflow role contract map. `getRoleContract()` resolves the corresponding public Agent Contract; `validateRoleContract()` checks requested capability/executor constraints. These values describe workflow roles; they do not assign roles, authenticate agents, grant runtime capabilities, approve work, or dispatch tasks. Workflow plan/authorization and host tool registration remain authoritative.

## Version-pinned custom role profiles

~~~js
import {
  normalizeRoleProfileBindings,
  resolveRoleProfileBindings,
  createRoleProfileOverlay,
  validateRoleProfileOverlay
} from '@runalith/workflow-runtime/role-profiles';

// workflowStore.db is the already-initialized, host-owned Workflow connection.
const pins = normalizeRoleProfileBindings(workflowStore.db, 'standard-engineering', [
  { role: 'architect', custom_role_id: 'architecture-profile', custom_role_version: 2 }
]);
const resolved = resolveRoleProfileBindings(workflowStore.db, pins);
const overlay = createRoleProfileOverlay('architect', resolved[0].profile, resolved[0].profile_hash);
validateRoleProfileOverlay('architect', overlay);
~~~

The API validates exact custom role IDs/versions against built-in role input/output contracts, derives SHA-256 profile pins and verifies detached execution overlays. It receives a caller-owned SQLite connection and performs read-only lookups; the caller owns connection lifetime and all writes. Snapshot overlays include only role ID/version, name, prompt, input contract, output artifact type and skill snapshot. They do not carry custom-role permissions, allowed capabilities or tool grants. This API does not assign roles, authorize tools/workspace access, approve tasks, or dispatch work.

## Durable execution evidence contract

~~~js
import {
  canonicalExecutionEvidenceContent,
  executionEvidence,
  validateEvidenceContract
} from '@runalith/workflow-runtime/evidence';

const content = canonicalExecutionEvidenceContent({
  taskId: task.task_id,
  executionSessionId: task.execution_session_id,
  attempt: task.execution_attempt,
  command: task.metadata.command,
  exitCode: task.execution_exit_code,
  status: task.execution_status,
  stdout: task.execution_stdout,
  stderr: task.execution_stderr
});
const verdict = validateEvidenceContract(task, { outcome: 'success', content }, plannedExecution);
~~~

This API accepts detached task/result/plan objects. It validates durable task state, exact exit status/code, `ExecutionManager` identity, session and attempt binding, immutable plan command identity, canonical result bytes and evidence markers. It does not query a database, retrieve provider artifacts, independently attest a worker/provider, persist results or authorize terminalization. Callers select trusted active rows and retain Workflow transaction/persistence authority. A valid result proves internal consistency of supplied evidence, not independent provider attestation.

## Scoped workspace-write contract

~~~js
import {
  WorkspaceWriteContractError,
  normalizeWorkspaceWriteContract,
  pathIsWithinWorkspaceWriteScope,
  workspaceWriteScopeForRole
} from '@runalith/workflow-runtime/workspace-write-contract';

const contract = normalizeWorkspaceWriteContract({
  workflowId: 'standard-engineering',
  workflowVersion: 3,
  workspace: approvedWorkspace,
  requiredOperations: ['workspace.write'],
  scopes: [{ role: 'engineer', paths: [{ path: 'src', kind: 'directory' }] }]
});
~~~

The API accepts only `standard-engineering@3+`, requires the declared `workspace.write` operation, allows only `engineer`/`writer` scopes, validates normalized workspace-relative paths, and checks existing file/directory targets using Workspace Runtime's descriptor-anchored filesystem. It rejects symlinks, noncanonical/traversing paths, unsupported workflows/roles/operations and overlapping/duplicate scopes. The normalizer is read-only: it does not mutate files, create receipts, verify current owner approval, grant executor capabilities or authorize a task. `WorkspaceWriteCapabilityService` and WorkflowStore retain plan/approval rechecks, writer-lock fencing, atomic file replacement, receipts, events and recovery.

## Development and validation

~~~sh
npm ci
npm run check
npm run test:packed-consumer
npm run pack:check
~~~

npm run check verifies the pinned source hashes, checks the public entrypoint syntax, and runs the focused test suite. npm run test:packed-consumer packs the package, installs it into an isolated temporary consumer, and exercises the public API with an injected SQLite connection. npm run pack:check runs npm pack --dry-run.

GitHub Actions runs the checks on Node.js 22 and 24 on Ubuntu. These tests establish package-level behavior and composition contracts; they do not certify a host deployment, trust configuration, provider, process executor, or production database.

## License

MIT. See [LICENSE](LICENSE).

## Workflow Plan API v1

The immutable plan validator/normalizer is exposed separately from database composition:

~~~js
import {
  workflowPlanApi,
  validateExecutionPlan,
  assertTaskDependenciesMatchPlan,
  resolveTaskBatchRoute,
} from '@runalith/workflow-runtime/workflow-plan';

const validatedPlan = validateExecutionPlan(plan);
const canonical = workflowPlanApi.canonicalJson(validatedPlan);
~~~

The API is frozen/versioned (`WORKFLOW_PLAN_API_VERSION = 1`) and exposes four named methods: `canonicalJson`, `validateExecutionPlan`, `assertTaskDependenciesMatchPlan`, and `resolveTaskBatchRoute`. It has no SQLite, WorkflowStore or mutable persistence capability. Use this subpath for read/validation integrations that do not need the runtime store.

Typed action-intent validation also requires a host-owned semantic verifier. Configure it once through the package export before validating plans that contain typed action intents:

~~~js
import { configureCompiledActionIntentSemanticVerifier } from '@runalith/workflow-runtime/workflow-plan';

configureCompiledActionIntentSemanticVerifier(hostOwnedSemanticVerifier);
~~~

The callback is an integration port, not an authorization grant. It cannot be replaced after initial configuration. The package keeps structural validation; the host retains semantic policy and all approval/dispatch authority.
