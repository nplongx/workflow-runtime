# Workflow phases

`@runalith/workflow-runtime/phases` exposes the package-owned immutable phase vocabulary for consumers that need to compare or display Workflow runtime phase values.

~~~js
import { WorkflowPhase, PRODUCTION_PHASES } from '@runalith/workflow-runtime/phases';

if (runtime.phase === WorkflowPhase.RUN_CHILDREN) {
  // Use host-controlled scheduler and Workflow APIs; this constant grants no authority.
}
~~~

`WorkflowPhase` is a frozen object with these values, in lifecycle order:

`PROPOSED`, `APPROVED`, `SPAWN_CTO`, `ASSIGN_CHILDREN`, `RUN_CHILDREN`, `WAIT`, `VALIDATE_EVIDENCE`, `SYNTHESIZE`, `TERMINALIZE`, `PROJECT`, `COMPLETED`, `FAILED`.

`PRODUCTION_PHASES` is a frozen array containing the same ordered values. Both exports come directly from `src/runtime/workflow/phases.js`, already used by package-owned Workflow definitions. The public export does not introduce a second phase definition or alter values/order.

## Ownership boundary

These values are identifiers only. They do not validate transition legality, persist runtime state, append events, approve work, lease tasks, dispatch agents, or execute work. Workflow Runtime and the host WorkflowStore retain lifecycle transitions and transaction ownership. A consumer must not treat a phase string as an authorization signal.
