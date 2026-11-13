# Workflow Runtime

`@runalith/workflow-runtime` is a local-first, SQLite-backed runtime for durable workflow lifecycle, immutable plan binding, approvals, tasks, leases, artifacts, execution state, event history, reports and Agent Session orchestration.

**Status:** GitHub-first source package `0.2.0`; pre-1.0 APIs and migration compatibility remain under review. Not published to npm.

```sh
npm install github:nplongx/workflow-runtime
```

## Requirements

- Node.js `>=22.13.0` (`node:sqlite`).
- Local filesystem for SQLite database.

## Build and tests

```sh
npm ci
npm run check
npm run pack:check
npm run test:packed-consumer
```

The package has no third-party runtime dependency. Its COS-AP v1 wire contract source mirror is included under `protocol/cos-ap-v1/` to preserve offline, deterministic installs.

## API example

```js
import { openWorkflowDatabase, createRunalithWorkflowStore } from '@runalith/workflow-runtime';

const { database } = openWorkflowDatabase({
  environment: { WORKFLOW_DB: '/absolute/private/path/workflow.db' }
});
const runtime = createRunalithWorkflowStore(database);
console.log(runtime.getStats());
// Host owns connection lifetime.
database.close();
```

`WorkflowStoreCore` is the base Workflow store. `WorkflowStore` / `RunalithWorkflowStore` compose Agent Session API and Execution Persistence adapters on the same connection. The legacy `workflowStore` singleton is lazy: importing this package does not create directories or open a database; first property access initializes the default host store.

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

The API is frozen/versioned (`WORKFLOW_PLAN_API_VERSION = 1`) and exposes only four named methods: `canonicalJson`, `validateExecutionPlan`, `assertTaskDependenciesMatchPlan`, and `resolveTaskBatchRoute`. It has no SQLite, WorkflowStore or mutable persistence capability. Use this subpath for read/validation integrations that do not need the runtime store.

## Database and transaction semantics

`openWorkflowDatabase()` validates canonical path ancestry, creates a private database directory, opens SQLite with foreign keys enabled, applies schema/migrations and returns `{ database, dbPath }`. `initializeWorkflowDatabase(database)` initializes a caller-owned compatible SQLite connection. `WorkflowStoreCore` accepts an injected connection.

`WorkflowStatePort v2` remains the in-process Workflow coordination boundary. `ExecutionStatePort v1` exposes frozen, read-only attempt/result/batch/checkpoint projections. `ExecutionStateParticipant v1` exposes typed writes inside Workflow-owned transactions. Neither exposes a DB handle or generic transaction callback. Execution persistence and Agent Session use corresponding named APIs while retaining same-connection atomicity.

This package does **not** claim an independent datastore, service process or distributed transaction protocol. Workflow still coordinates leases, task projections, shared event journal and cross-domain send/result fences.

## Host-owned trust and QA dependencies

Owner approval contract constants and canonical serialization are included; Ed25519 Trust configuration and signature verification remain host-provided through an injected verifier callback. Missing verifier rejects protected approval operations.

Production behavioral QA requires an explicit trusted host root via `configureProductionQaHarnessRoot(absolutePath)`, or the legacy source-layout resolver. The host root must include canonical `server/index.js` and `tests/test-production-behavioral-qa.js`; the latter must match the checked-in SHA-256 pin. Missing/mismatched harness means production QA is unavailable, never silently trusted.

## Compatibility

The API is versioned and pre-1.0. Back up durable databases before upgrades. API, storage and operational semantics may change before 1.0.

See [`docs/architecture.md`](docs/architecture.md), [`docs/source-manifest.json`](docs/source-manifest.json) and [`SECURITY.md`](SECURITY.md).
