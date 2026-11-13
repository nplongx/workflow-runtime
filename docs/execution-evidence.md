# Durable Workflow execution evidence contract

Import the explicit API:

~~~js
import {
  canonicalExecutionEvidenceContent,
  executionEvidence,
  validateEvidenceContract
} from '@runalith/workflow-runtime/evidence';
~~~

The evidence helpers form a pure consistency contract across detached durable task, result and immutable plan read models. They do not open or query SQLite, execute commands, retrieve provider artifacts, authenticate a worker/provider independently, persist results, append events or terminalize Workflow state.

## Evidence construction

`canonicalExecutionEvidenceContent()` emits canonical result content with exact task ID, execution session ID, attempt, command, exit status/code, execution status, stdout and stderr. Consumers persist those exact bytes with the result outcome through the existing Workflow result transaction.

## Read-model validation

`executionEvidence(task, result, plannedExecution)` normalizes caller-supplied rows for inspection. `validateEvidenceContract(task, result, plannedExecution)` checks:

- durable task status is `completed`, exit status is `completed`, exit code is exact numeric `0`, and durable result outcome is `success`;
- task ID, `ExecutionManager` executor, nonempty execution session ID and positive safe-integer attempt are present;
- persisted command is one of the immutable command forms derived from the supplied plan;
- result text contains canonical evidence markers and exact task/session/attempt/command/status lines;
- result bytes equal canonical content reconstructed from the supplied task read model.

The returned `valid` flag means only that supplied read models agree with this contract. It does not independently attest provider identity or prove command execution. Callers must select trusted active rows, bind them to the immutable plan and own the correct same-connection transaction for persistence/terminalization.

## Ownership boundary

Workflow Runtime owns only formatting and pure validation. Host/WorkflowStore owns database reads, row selection, result persistence, event append, retry/lease checks and terminal state transitions. Execution Runtime owns process/provider adapters, not this Workflow-level lifecycle decision.
