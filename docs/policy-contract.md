# Policy Contract API

`@runalith/workflow-runtime/policy-contract` exposes these pure helpers:

- `normalizePolicyDefinition`
- `createPolicySnapshot` and `validatePolicySnapshot`
- `composePolicySuccessContract`
- `getWorkflowPolicyCatalog` and `policyRuleIdForSnapshot`
- `inspectStoredWorkflowPolicyRow`
- `resolveValidationProfileSnapshot`, `validateValidationProfileSnapshot` and `materializeValidationProfileTasks`

```js
import {
  normalizePolicyDefinition, createPolicySnapshot, validatePolicySnapshot,
  composePolicySuccessContract, resolveValidationProfileSnapshot,
  materializeValidationProfileTasks
} from '@runalith/workflow-runtime/policy-contract';
```

The API normalizes caller-supplied records and constructs immutable/hash-bound policy snapshots. Composition evaluates structural compatibility against caller-supplied plan read models; it does not approve or attach a policy. Validation-profile materialization creates bounded local task descriptors from an immutable built-in profile and workspace path; it does not execute them or grant permissions.

The public subpath does not export `initializeWorkflowPolicyStore`, policy CRUD, attachment, event, or violation-write functions. Those operations remain inside Workflow Runtime's store composition, which owns the caller-provided SQLite connection and its Workflow transaction boundary. The pure API has no standalone database, approval, retry, dispatch, filesystem mutation, or process-execution authority.
