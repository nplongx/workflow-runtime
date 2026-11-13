# Workflow Runtime

[![CI](https://github.com/nplongx/workflow-runtime/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nplongx/workflow-runtime/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**@runalith/workflow-runtime** is a Node.js ESM library for durable, local-first workflow state. It provides Workflow lifecycle and plan storage, tasks and leases, approvals and event history, artifacts and reports, execution/attempt records, provider-dispatch persistence, and Agent Session orchestration on SQLite.

It is a composable runtime library, not a network service or a self-running workflow platform. The host application remains responsible for authenticated identity, trust configuration, provider calls, process execution, scheduling, external side effects, and operational recovery.

> **Status:** 0.2.0, GitHub-first source package. Not published to npm. Public APIs and storage/migration compatibility remain pre-1.0.

## Scope

- Durable Workflow/Job lifecycle, immutable plan snapshots, task state, leases, event journal, artifacts, reports, and workflow runtime state.
- Versioned in-process coordination contracts: WorkflowStatePort v2, WorkflowControlPort v1, and Execution ports/participants v1.
- Execution attempts, results, execution batches/items, and checkpoints.
- Provider run and dispatch-intent records, including unresolved-outcome and reconciliation state.
- Agent Session records, access grants, message queues, delivery claims, receipts, and lifecycle hooks.
- Workflow definitions, role/agent contracts, plan compilation, policy/success contracts, artifact validation, and evidence normalization.
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

There are no third-party runtime dependencies. The versioned COS-AP v1 source mirror is included in this repository so package installs do not need the parent application or another repository.

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
