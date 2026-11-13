# Terminology

This glossary applies to new documentation and API names. It does not rename persisted columns, events, wire fields, or pre-existing public compatibility surfaces.

| Term | Meaning in this repository |
|---|---|
| Workflow | Business process definition and plan. Some durable tables and legacy APIs still use job terminology. |
| Job | Legacy persisted Workflow aggregate. Preserve job_id where existing schema/API uses it. |
| Task | Unit of work within a Job/Workflow, identified by task_id. |
| Attempt | One numbered execution try for a task. The ordinal is not an attempt_id. |
| Execution | Runtime-owned attempt/result/batch state. It is not necessarily an OS process or provider run. |
| Provider run | Run created by an external provider. Provider state is observed through host adapters. |
| Provider dispatch intent | Durable record binding a proposed external provider operation to its idempotency and request identity. |
| Lease | Durable ownership/fencing record for task work. A lease value does not authenticate the caller by itself. |
| Agent Session | Durable session and message-delivery state associated with a task/agent. It is not an authenticated user session. |
| Artifact | Typed workflow content or reference plus declared identity/metadata. A digest alone does not prove authorship or truth. |
| Evidence | Material or observation submitted to support a workflow or policy decision. Verification needs trusted inputs. |
| Port | Narrow, versioned in-process API exposing named operations. It is not an RPC endpoint. |
| Participant | Narrow component invoked by Workflow while Workflow owns the surrounding transaction. |
| Host | Application integrating this library and supplying external trust, identity, execution, and operations. |

## State vocabulary

Do not use these words interchangeably:

- **state:** durable lifecycle position of a Job, Task, lease, attempt, or message.
- **status:** reported condition of a resource or result.
- **outcome:** observed result of an operation, including an ambiguous/unknown external result.
- **decision:** approval or policy evaluation result.
- **receipt:** durable record of a delivery or decision; its authority depends on authentication, binding, and custody.

Unknown or unresolved external outcomes must not be treated as success or safe-to-retry by default.

## Identifiers and compatibility

- job_id is retained in existing storage and APIs. Do not mechanically rename it to workflow_id.
- workflow_id identifies a workflow definition/contract where that vocabulary is already used.
- task_id identifies a task; attempt is the attempt ordinal; attempt_id identifies one attempt when provided.
- provider_run_id identifies an external provider run.
- idempotency_key identifies one logical external operation across retries. It is not a request ID or correlation ID.
- *_sha256 and other digests identify exact content under the documented serialization rules. They do not establish trust, authorship, approval, or authorization.

Public API methods, persisted schema fields, event types, canonical payloads, and protocol fields are compatibility surfaces. Change them through an explicit version/migration plan, not a naming cleanup.
