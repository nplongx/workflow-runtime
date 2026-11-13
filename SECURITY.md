# Security Policy

Report vulnerabilities privately through GitHub Security Advisories for nplongx/workflow-runtime. Do not publish exploit details before maintainers assess impact.

## Security scope

Workflow Runtime stores potentially sensitive prompts, approval evidence, artifacts, workflow events, provider request metadata, and Agent Session messages. Protect its database, WAL/SHM files, backups, host process, and workspace as application data with an appropriate security boundary.

This project is security-sensitive infrastructure. Passing its test suite is not a security audit or a certification for untrusted workloads.

## Host-owned authority

The host application must provide and enforce:

- Authentication of users, operators, workers, and service callers before passing identity claims into runtime operations.
- Authorization to create workflows, approve plans, grant session access, issue capabilities, dispatch providers, and execute work.
- Owner-approval trust roots, public-key provisioning, private-key custody, rotation/revocation, clock policy, and signature verification.
- Provider credentials, authenticated provider transport, provider idempotency, remote reconciliation, and decisions about retrying ambiguous outcomes.
- Process execution/sandboxing, workspace isolation, filesystem quotas, scheduling, cancellation, and cleanup.
- Database backup/restore, filesystem permissions for injected connections, monitoring, retention, and incident response.

A stored actor string, role, policy, hash, lease, approval receipt, or capability-shaped value is not proof that the caller is authenticated or authorized.

## Owner approval is fail-closed

The package includes the v1 owner-approval field vocabulary, canonical JSON serialization, and dispatch-argument digest helper. It does not include an Ed25519 trust store or production key-management service.

A host must configure WorkflowStore.setOwnerApprovalVerifier(verifier) with a trusted verifier. The verifier receives the supplied evidence, the runtime-computed expectation, the verification mode, and any consumed timestamp. It must independently establish signature validity, owner identity, trust-root status, scope, subject/plan/action/target binding, expiry, and nonce policy. Missing verifier rejects protected approval operations.

**Current package limitation:** OWNER_APPROVAL_ALLOWED_ACTION_IDS is an empty frozen list. buildOwnerApprovalExpectation() rejects an action not present in that list, and no action is currently allowlisted. Consequently the current package cannot produce an owner-approval-ready dispatch expectation for a concrete business action. A host verifier cannot override this package-level fail-closed check. Do not treat current approval APIs as a deployable authorization path.

## Database and filesystem

For runtime-opened databases, openWorkflowDatabase() checks canonical paths, directory/file types, ownership, hard-link count, and permissions. Keep the final data directory private and owned by the service account. Do not store the database in a shared writable directory or point it at an unrelated application's database.

When injecting a connection, the host is responsible for opening the correct database securely and protecting its files. Runtime initialization does not retroactively establish safe filesystem ownership for an injected file-backed connection.

Back up SQLite consistently with WAL mode. Protect backup copies and test restore procedures. A restored or replaced database can roll back local nonce, event, and idempotency state; external monotonic trust/checkpoint controls may be required by the host's threat model.

## Production QA harness

Production workflow QA relies on host-supplied files including server/index.js and tests/test-production-behavioral-qa.js. The root must be canonical and non-symlinked. The behavioral QA file must match the checked-in SHA-256 pin and emit every required success marker. Missing, mismatched, or untrusted harness state must remain unavailable/fail-closed. Do not replace or update the pin without reviewing the corresponding host harness change.

## External side effects and unknown outcomes

The runtime persists provider intent and observed outcomes; it does not perform provider calls. A timeout, crash, or missing response can leave the external outcome unknown. The host must reconcile against the provider before deciding whether an operation is safe to retry. Do not infer remote completion or cancellation from a local task/attempt state alone.

## Supported use

The package is intended to be embedded by a trusted host application. It is not a standalone authenticated network service and must not be exposed directly to untrusted callers.
