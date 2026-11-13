/** Stable, host-independent Workflow Plan API v1. */
import {
  canonicalJson,
  validateExecutionPlan,
  assertTaskDependenciesMatchPlan,
  resolveTaskBatchRoute
} from './workflow/plan.js';

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
