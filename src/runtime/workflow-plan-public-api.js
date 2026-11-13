/** Stable, host-independent Workflow Plan API v1. */
import {
  canonicalJson,
  validateExecutionPlan,
  assertTaskDependenciesMatchPlan,
  resolveTaskBatchRoute
} from './workflow/plan.js';
import { configureCompiledActionIntentSemanticVerifier } from './workflow/agent-contracts.js';

// The Workflow Runtime validates typed action intents, but their semantic
// policy is owned by the composing host. Expose the one-time verifier
// injection through the same package module instance used by
// validateExecutionPlan; a host-local mirror cannot configure this closure.
export { configureCompiledActionIntentSemanticVerifier };

export const WORKFLOW_PLAN_API_VERSION = 1;
export const WORKFLOW_PLAN_API_METHODS = Object.freeze([
  'canonicalJson',
  'validateExecutionPlan',
  'assertTaskDependenciesMatchPlan',
  'resolveTaskBatchRoute'
]);

export const workflowPlanApi = Object.freeze({
  version: WORKFLOW_PLAN_API_VERSION,
  canonicalJson,
  validateExecutionPlan,
  assertTaskDependenciesMatchPlan,
  resolveTaskBatchRoute
});

export { canonicalJson, validateExecutionPlan, assertTaskDependenciesMatchPlan, resolveTaskBatchRoute };
