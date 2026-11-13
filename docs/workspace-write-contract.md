# Scoped workspace-write contract

Import the public Workflow contract:

~~~js
import {
  WorkspaceWriteContractError,
  normalizeWorkspaceWriteContract,
  pathIsWithinWorkspaceWriteScope,
  workspaceWriteScopeForRole
} from '@runalith/workflow-runtime/workspace-write-contract';
~~~

The API validates a plan's declared `workspace.write` operation and role-specific workspace-relative path scopes. It is not a write capability executor or an approval service.

## Validation rules

`normalizeWorkspaceWriteContract()` accepts only the built-in `standard-engineering` workflow at version 3 or later; custom workflows and other templates remain read-only. It rejects unsupported operations, missing scopes, duplicate role/path scopes, unsupported roles, noncanonical/absolute/traversing paths, symlinks, and scope targets that are not regular single-link files or existing directories. `engineer` and `writer` are the only scoped-write roles. A contract may include at most 8 roles and 16 path entries per role.

Workspace path checks use `@runalith/workspace-runtime/filesystem`. Generic role/action-intent vocabulary comes from `@runalith/agent-contracts`. Workflow Runtime retains the adapter because supported templates and scoped-write role rules are Workflow-owned.

## Ownership and authority

The returned object describes a plan-scoped contract. It does not assign a role, authorize a task, verify owner approval, mint a permission token, mutate the workspace, invoke arbitrary commands, or persist a receipt. Callers must treat it as input to the separately guarded `WorkspaceWriteCapabilityService`.

`WorkspaceWriteCapabilityService` and WorkflowStore remain responsible for checking the immutable execution plan and current approval at the writer-lock fence, performing compare-before-replace filesystem operations, recording per-file intents/receipts, appending events, and recovering partial outcomes. This subpath does not bypass or replace those fences.
