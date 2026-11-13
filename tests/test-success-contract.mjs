import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSuccessContract,
  validateSuccessContract,
  hasEnforcedSuccessCriteria,
  evaluateSuccessPredicate,
  validateSuccessAssessment,
  successContractPrompt
} from '../src/runtime/workflow/success-contract.js';

const context = {
  plan: { workflow_id: 'standard-engineering', children: [{ id: 'build', role: 'engineer', execution: { executor: 'ExecutionManager', deterministic: true } }] },
  tasks: [{ id: 'durable-build', status: 'completed', execution_status: 'completed', execution_exit_code: 0,
    metadata_json: '{"workflow_plan_task_id":"build"}', created_at: '2026-11-13T00:00:00Z', durable_rowid: 1 }],
  artifacts: [{ artifact_id: 'artifact-1', type: 'qa-report', producer_role: 'qa', content: { decision: 'accept', issues: [] } }]
};

test('normalizes a typed success contract and validates its canonical representation', () => {
  const contract = normalizeSuccessContract({
    goal: 'Complete the local build.',
    constraints: [{ id: 'local-only', type: 'local_execution_only' }],
    success_criteria: [{ id: 'build-exit-zero', type: 'execution_exit_code_equals', task_id: 'build', expected: 0 }]
  });
  assert.equal(contract.schema_version, 1);
  assert.equal(validateSuccessContract(contract).goal, 'Complete the local build.');
  assert.equal(hasEnforcedSuccessCriteria(contract), true);
  assert.equal(Object.isFrozen(contract), true);
});

test('evaluates task, execution and artifact predicates using only supplied detached read models', () => {
  assert.equal(evaluateSuccessPredicate({ id: 'all-done', type: 'all_tasks_completed' }, context).passed, true);
  assert.equal(evaluateSuccessPredicate({ id: 'exit-zero', type: 'execution_exit_code_equals', task_id: 'build', expected: 0 }, context).passed, true);
  assert.equal(evaluateSuccessPredicate({ id: 'qa-accept', type: 'artifact_field_equals', artifact_type: 'qa-report', field: 'decision', expected: 'accept' }, context).passed, true);
  assert.equal(evaluateSuccessPredicate({ id: 'wrong-exit', type: 'execution_exit_code_equals', task_id: 'build', expected: 1 }, context).passed, false);
});

test('validates exact assessment rows and their evidence references', () => {
  const contract = normalizeSuccessContract({
    goal: 'Complete QA.',
    success_criteria: [{ id: 'qa-accepted', type: 'artifact_field_equals', artifact_type: 'qa-report', field: 'decision', expected: 'accept' }]
  });
  const assessment = { goal_status: 'achieved', summary: 'QA accepted.',
    criteria: [{ id: 'qa-accepted', status: 'met', evidence_refs: ['artifact-1'] }], constraints: [] };
  assert.deepEqual(validateSuccessAssessment(contract, assessment, context), { valid: true, errors: [] });
  const missingEvidence = { ...assessment, criteria: [{ id: 'qa-accepted', status: 'met', evidence_refs: ['missing'] }] };
  assert.equal(validateSuccessAssessment(contract, missingEvidence, context).valid, false);
});

test('rejects unsupported predicate fields, unsafe values and noncanonical contracts', () => {
  assert.throws(() => normalizeSuccessContract({ success_criteria: [{ id: 'unknown', type: 'model_says_pass' }] }), /unsupported/);
  assert.throws(() => normalizeSuccessContract({ success_criteria: [{ id: 'nonzero', type: 'execution_exit_code_equals', task_id: 'build', expected: 1 }] }), /numeric 0/);
  const valid = normalizeSuccessContract({ goal: 'Canonical.' });
  assert.throws(() => validateSuccessContract({ ...valid, extra: true }), /canonical normalized form/);
});

test('legacy goal-only contract is valid and prompt preserves immutable requirements', () => {
  const contract = normalizeSuccessContract({ goal: 'Read existing source.' });
  assert.equal(hasEnforcedSuccessCriteria(contract), false);
  assert.deepEqual(validateSuccessAssessment(contract, undefined, {}), { valid: true, errors: [] });
  assert.match(successContractPrompt(contract), /IMMUTABLE WORKFLOW SUCCESS CONTRACT/);
});
