# Workflow roles and task capabilities

`@runalith/workflow-runtime/roles` exposes the built-in Workflow role descriptors and capability vocabulary.

~~~js
import {
  TaskCapability,
  ROLE_CONTRACTS,
  getRoleContract,
  validateRoleContract
} from '@runalith/workflow-runtime/roles';

const engineer = validateRoleContract('engineer', { capability: TaskCapability.CODE_MODIFY });
~~~

Exports:

- `TaskCapability`: frozen capability constants such as `architecture.design`, `code.modify`, `code.verify`, `change.review`, `synthesis.approve`, `security.audit`, and `documentation.write`.
- `ROLE_CONTRACTS`: frozen map of built-in workflow role aliases and their capability/executor/permission descriptors.
- `getRoleContract(role)`: case-insensitive role lookup returning the corresponding public Agent Contract.
- `validateRoleContract(role, { capability, executor })`: validates optional capability and executor constraints before returning the Agent Contract.

## Ownership boundary

This API exposes immutable descriptors and pure validation only. It does not assign a role to a task, authenticate an agent, grant a filesystem or execution capability, register tools, approve a workflow, dispatch work, or enforce an OS sandbox. The Workflow plan, task authorization gates, Owner Approval contract, workspace capability service, and host tool registration remain authoritative.

`ROLE_CONTRACTS` retains the legacy `productowner` alias for compatibility. Canonical Agent Contracts remain owned by the separate `@runalith/agent-contracts` package and are resolved by `getRoleContract()`.
