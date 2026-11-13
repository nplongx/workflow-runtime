# Version-pinned custom role profiles

Import the explicit API:

~~~js
import {
  BUILTIN_ROLE_PROFILE_OVERLAY_ROLES,
  roleProfileSnapshot,
  roleProfileHash,
  normalizeRoleProfileBindings,
  resolveRoleProfileBindings,
  createRoleProfileOverlay,
  validateRoleProfileOverlay
} from '@runalith/workflow-runtime/role-profiles';
~~~

The API provides a narrow adapter between persisted custom-role versions and immutable Workflow task overlays. It receives an initialized Workflow database connection from the caller. It does not open a database, initialize schema, write custom roles, update Workflow state, assign a role, grant capabilities, approve a task or dispatch an executor.

## Binding and version rules

`normalizeRoleProfileBindings(db, workflowId, bindings)` accepts only `standard-engineering` and `hybrid-engineering`, an allowlisted built-in role, an exact lowercase custom role ID and an explicit positive integer version. `latest` is never inferred. Duplicate built-in role bindings and unsupported fields are rejected. Each result records the exact role ID/version and a SHA-256 hash of the immutable overlay snapshot.

`resolveRoleProfileBindings(db, bindings)` loads each exact version and verifies the stored hash before returning the detached snapshot. Missing versions or changed snapshot content fail closed.

## Snapshot and overlay boundary

`roleProfileSnapshot(profile)` copies only `role_id`, `version`, `name`, `system_prompt`, `input_contract`, `output_artifact_type`, and `skills`. `roleProfileHash(profile)` hashes this canonical snapshot. `createRoleProfileOverlay(role, profile, hash)` and `validateRoleProfileOverlay(role, overlay)` enforce compatibility with the built-in role's declared artifact inputs and output type and verify the immutable hash.

The overlay deliberately excludes `description`, `allowed_capabilities`, `permissions`, and `allowed_tools`. Profile prompts and skills are descriptive/behavioral inputs, not authorization. Host role assignment, workspace/tool enforcement, approvals and dispatch remain separate gates.

## Caller-owned database

The API uses only the supplied `db` object for exact-version reads through the Workflow Runtime custom-role store. The host owns database initialization, transaction boundaries and connection lifetime. Callers must pass the same database connection used by WorkflowStore. The profile APIs perform read-only lookups; custom role creation/version updates remain separate WorkflowStore operations.
