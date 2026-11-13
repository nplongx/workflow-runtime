# Recovery compatibility and Workflow tool errors

`@runalith/workflow-runtime/recovery-compatibility` exposes a pure classifier for review-driven recovery eligibility.

```js
import { classifyReviewRecovery, supportsReviewDrivenRecovery } from '@runalith/workflow-runtime/recovery-compatibility';
import { WorkflowToolError, isWorkflowToolError } from '@runalith/workflow-runtime/tool-errors';
```
 It accepts caller-supplied immutable plan and job read models. It reports whether the plan shape and current job state are compatible, with diagnostic codes and suggested inspection/creation tools.

The classifier does not load state, retry tasks, modify a plan, attach policy, approve, dispatch, or authorize recovery. `supported: true` is a compatibility result only; the host must still enforce current approval, task/evidence integrity, leases, provider outcome reconciliation, and transaction rules.

`@runalith/workflow-runtime/tool-errors` exposes `WorkflowToolError` and `isWorkflowToolError` for a stable structured error envelope. It does not decide whether an operation is authorized or retryable. Callers must populate error facts from their authoritative runtime state; an error's `retryable` field is diagnostic data, not a retry grant.
