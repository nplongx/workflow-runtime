# Success Contracts

`@runalith/workflow-runtime/success-contract` exposes pure normalization and evaluation functions for immutable Workflow success predicates.

~~~js
import {
  normalizeSuccessContract,
  validateSuccessContract,
  hasEnforcedSuccessCriteria,
  evaluateSuccessPredicate,
  validateSuccessAssessment,
  successContractPrompt
} from '@runalith/workflow-runtime/success-contract';

const contract = normalizeSuccessContract({
  goal: 'Complete local validation.',
  success_criteria: [{ id: 'all-work-complete', type: 'all_tasks_completed' }]
});

const predicate = evaluateSuccessPredicate(contract.success_criteria[0], {
  plan: { children: [{ id: 'build' }] },
  tasks: [{ metadata_json: '{"workflow_plan_task_id":"build"}', status: 'completed' }]
});
~~~

Exports:

- `normalizeSuccessContract(input, fallbackGoal)` canonicalizes goal, constraints and criteria with exact typed predicate fields.
- `validateSuccessContract(contract)` verifies schema version and canonical normalized representation.
- `hasEnforcedSuccessCriteria(contract)` reports whether constraints or criteria exist.
- `evaluateSuccessPredicate(predicate, { plan, tasks, artifacts })` evaluates one predicate against caller-supplied detached read models.
- `validateSuccessAssessment(contract, assessment, context)` checks reviewer/CTO assessment rows, status and evidence references against supplied context.
- `successContractPrompt(contract)` renders the immutable contract into prompt text.

## Ownership boundary

All plan, task and artifact inputs are supplied by the caller. The module does not open a database, query WorkflowStore, decide which artifacts are trusted/current, authenticate a reviewer, verify attestations, persist approvals, append events, mutate tasks or terminalize a workflow. Host must select verified active evidence and call these functions with the exact read models acquired inside the appropriate transaction/consistency boundary.

`local_execution_only` is a structural predicate over the supplied immutable plan. It is not a sandbox or execution policy enforcement mechanism by itself. Actual dispatch remains guarded by Workflow authorization and Execution contracts.
