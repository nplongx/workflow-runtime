import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyReviewRecovery,
  supportsReviewDrivenRecovery
} from '../src/runtime/workflow/recovery-compatibility.js';
import {
  WorkflowToolError,
  isWorkflowToolError
} from '../src/runtime/workflow/tool-errors.js';

test('review-driven recovery supports only standard-engineering v2 or later', () => {
  assert.equal(supportsReviewDrivenRecovery({ workflow_id: 'standard-engineering', workflow_version: 2 }), true);
  assert.equal(supportsReviewDrivenRecovery({ workflow_id: 'STANDARD-ENGINEERING', workflow_version: 3 }), true);
  assert.equal(supportsReviewDrivenRecovery({ workflow_id: 'engineering', workflow_version: 3 }), false);
  assert.equal(supportsReviewDrivenRecovery({ workflow_id: 'standard-engineering', workflow_version: 1 }), false);
  assert.equal(supportsReviewDrivenRecovery({ workflow_id: 'standard-engineering', workflow_version: '2.5' }), false);
});

test('recovery classification fails closed when immutable plan is absent', () => {
  const result = classifyReviewRecovery({ job: { job_id: 'job_missing', state: 'EXECUTING', status: 'active' } });
  assert.equal(result.supported, false);
  assert.equal(result.retryable, false);
  assert.equal(result.code, 'WORKFLOW_PLAN_MISSING');
  assert.equal(result.category, 'invalid_state');
  assert.equal(result.next_action.tool, 'workflow_get');
});

test('unsupported plan proposes a new versioned workflow without authorizing mutation', () => {
  const result = classifyReviewRecovery({
    plan: { workflow_id: 'production', workflow_version: 7 },
    job: { job_id: 'job_unsupported', state: 'EXECUTING', status: 'active' }
  });
  assert.equal(result.supported, false);
  assert.equal(result.retryable, false);
  assert.equal(result.code, 'WORKFLOW_REWORK_UNSUPPORTED');
  assert.equal(result.next_action.tool, 'workflow_create');
  assert.equal(result.next_action.workflow, 'standard-engineering');
});

test('supported plan still requires an active EXECUTING workflow', () => {
  const result = classifyReviewRecovery({
    plan: { workflow_id: 'standard-engineering', workflow_version: 3 },
    job: { job_id: 'job_waiting', state: 'WAITING_APPROVAL', status: 'active' }
  });
  assert.equal(result.supported, false);
  assert.equal(result.retryable, false);
  assert.equal(result.code, 'WORKFLOW_NOT_EXECUTING');
  assert.equal(result.next_action.tool, 'workflow_get');
});

test('eligible plan and active execution classify as supported but do not authorize recovery', () => {
  const result = classifyReviewRecovery({
    plan: { workflow_id: 'standard-engineering', workflow_version: 3 },
    job: { job_id: 'job_active', state: 'EXECUTING', status: 'active' }
  });
  assert.equal(result.supported, true);
  assert.equal(result.retryable, false);
  assert.equal(result.code, null);
  assert.equal(result.next_action, null);
});

test('WorkflowToolError normalizes its structured error envelope', () => {
  const error = new WorkflowToolError('provider outcome unknown', {
    code: 'EXECUTION_OUTCOME_UNKNOWN',
    category: 'unresolved_execution_outcome',
    retryable: false,
    job_id: 'job_42',
    workflow_id: 'standard-engineering',
    workflow_version: 3,
    task_id: 'task_provider',
    capability: 'remote_execution',
    side_effects: ['provider_dispatch_may_have_started'],
    workspace_mutation_status: 'not_modified',
    evidence_missing: ['authoritative_provider_receipt'],
    next_actions: [{ tool: 'workflow_get' }],
    details: { reconciliation_required: true }
  });
  assert.equal(error instanceof Error, true);
  assert.equal(isWorkflowToolError(error), true);
  assert.equal(error.name, 'WorkflowToolError');
  assert.deepEqual(error.toJSON(), {
    code: 'EXECUTION_OUTCOME_UNKNOWN',
    category: 'unresolved_execution_outcome',
    message: 'provider outcome unknown',
    retryable: false,
    job_id: 'job_42',
    workflow_id: 'standard-engineering',
    workflow_version: 3,
    job_state: null,
    task_id: 'task_provider',
    capability: 'remote_execution',
    side_effects: ['provider_dispatch_may_have_started'],
    workspace_mutation_status: 'not_modified',
    evidence_missing: ['authoritative_provider_receipt'],
    next_actions: [{ tool: 'workflow_get' }],
    details: { reconciliation_required: true }
  });
});

test('WorkflowToolError defaults invalid categories and malformed option values safely', () => {
  const error = new WorkflowToolError('', {
    code: '', category: 'invented', retryable: 'yes', workflow_version: '3',
    side_effects: 'not-an-array', evidence_missing: null, next_actions: {}, details: null
  });
  assert.equal(error.message, 'workflow operation failed');
  assert.equal(error.code, 'WORKFLOW_OPERATION_FAILED');
  assert.equal(error.category, 'validation_failure');
  assert.equal(error.retryable, false);
  assert.equal(error.workflow_version, null);
  assert.deepEqual(error.side_effects, []);
  assert.deepEqual(error.evidence_missing, []);
  assert.deepEqual(error.next_actions, []);
  assert.deepEqual(error.details, {});
  assert.equal(isWorkflowToolError(new Error('other')), false);
});
