# Custom Workflow definition contract

`@runalith/workflow-runtime/custom-workflow-contract` exports two pure helpers:

- `getCustomWorkflowRoleLookupRequests(input)` validates basic bounded definition/task identity fields and returns `{ task_id, role_id, role_version }` lookup requests.
- `normalizeCustomWorkflowDefinition(input, { roleSnapshotsByTaskId })` validates task inputs/outputs against host-resolved exact-version role snapshots, checks dependency references, predecessor artifact types and DAG acyclicity, then returns canonical definition DTO.

```js
import {
  getCustomWorkflowRoleLookupRequests,
  normalizeCustomWorkflowDefinition
} from '@runalith/workflow-runtime/custom-workflow-contract';

const requests = getCustomWorkflowRoleLookupRequests(input);
const roleSnapshotsByTaskId = Object.fromEntries(
  requests.map(({ task_id, role_id, role_version }) => [
    task_id,
    readExactCustomRole(role_id, role_version)
  ])
);
const definition = normalizeCustomWorkflowDefinition(input, { roleSnapshotsByTaskId });
```

`readExactCustomRole` above represents the host's authoritative store lookup; it is not exported by this package. The package verifies that each supplied role snapshot matches task role identity and any explicit version pin. An omitted version is resolved by the host as its current latest immutable role version before calling the pure normalizer.

This API does not read/write SQLite, create custom Workflow versions, create/approve preview plans, assign permissions, ingest skills, authorize execution or dispatch tasks. Host `custom-workflows.js` retains the custom Workflow/version/plan tables, exact role lookup and all preview/approval/execution-spec lifecycle operations. Host `custom-roles.js` retains skill ingestion and immutable role-version writes.
