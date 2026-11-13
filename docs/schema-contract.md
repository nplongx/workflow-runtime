# Workflow schema contract

\`@runalith/workflow-runtime/schema-contract\` exports only the pure \`validateWorkflowDefinition\` function. It validates a detached definition record's identifier, positive integer version, non-empty phase list, required child list and duplicate phase/child IDs. It returns the original validated value.

\`validateProductionWorkflow\`, \`validateEngineeringWorkflow\`, \`validateStandardEngineeringWorkflow\` and \`validateHybridEngineeringWorkflow\` remain outside this narrow API. In particular, production task validation continues to use the host-owned immutable Production QA harness digest and host-supplied plugin root. The new export does not configure a harness, compile a plan, authorize lifecycle transitions, persist state, approve or dispatch.

\`\`\`js
import { validateWorkflowDefinition } from '@runalith/workflow-runtime/schema-contract';

validateWorkflowDefinition({
  id: 'example-workflow', version: 1,
  phases: ['plan', 'execute'],
  requiredChildren: ['architect', 'engineer']
});
\`\`\`
