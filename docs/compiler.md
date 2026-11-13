# Workflow plan compiler

\`@runalith/workflow-runtime/compiler\` exports \`createWorkflowPlanCompiler({ productionCatalog? })\`. The returned \`compileWorkflowPlan(job, options)\` preserves schema-v1 compatibility, emits schema-v2 batch execution policy by default, composes pure success/policy contracts, applies version-pinned role profile overlays and scoped workspace-write contracts, validates compiled Agent Action Intents using the shared injected semantic verifier, validates the result and returns an immutable canonical SHA-256 plan.

```js
import { createWorkflowPlanCompiler } from '@runalith/workflow-runtime/compiler';
const compileWorkflowPlan = createWorkflowPlanCompiler();
const plan = compileWorkflowPlan({ job_id: 'job-1', title: 'Engineering M4' }, { workspace: '/workspace' });
```

Production Workflow requires an explicit host-owned catalog adapter:

```js
const compileWorkflowPlan = createWorkflowPlanCompiler({
  productionCatalog: { ProductionTaskId, productionTaskSpec, productionChildTaskSpecs }
});
```

Only the host is expected to supply this adapter. It resolves the digest-pinned Production QA harness against the plugin root. Without that adapter, Production compilation fails closed with \`PRODUCTION_WORKFLOW_CATALOG_REQUIRED\`. The public package does not export the Production QA catalog or harness path/digest.

The compiler consumes detached job/custom-workflow/policy/profile/action-intent read models. It does not query or mutate SQLite, persist plans, grant permissions, approve, perform workflow transitions, execute tasks, retry or dispatch. Approval and trusted plan persistence remain host/WorkflowStore responsibilities. Local process and workspace authorities remain host-owned.
