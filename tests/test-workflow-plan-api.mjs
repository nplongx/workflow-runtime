import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WORKFLOW_PLAN_API_VERSION,
  WORKFLOW_PLAN_API_METHODS,
  workflowPlanApi,
  canonicalJson,
  configureCompiledActionIntentSemanticVerifier,
  validateExecutionPlan,
  assertTaskDependenciesMatchPlan,
  resolveTaskBatchRoute
} from '../index.js';

test('Workflow Plan API v1 is frozen, versioned and has an exact four-method surface', () => {
  assert.equal(WORKFLOW_PLAN_API_VERSION, 1);
  assert.equal(workflowPlanApi.version, WORKFLOW_PLAN_API_VERSION);
  assert.equal(Object.isFrozen(workflowPlanApi), true);
  assert.deepEqual(Object.keys(workflowPlanApi).filter(key => key !== 'version').sort(),
    [...WORKFLOW_PLAN_API_METHODS].sort());
  assert.equal(WORKFLOW_PLAN_API_METHODS.length, 4);
});

test('canonical JSON sorts keys deterministically and retains own __proto__ data', () => {
  const value = JSON.parse('{"z":1,"__proto__":{"polluted":true},"a":{"d":4,"c":3}}');
  assert.equal(canonicalJson(value), '{"__proto__":{"polluted":true},"a":{"c":3,"d":4},"z":1}');
  assert.equal(Object.hasOwn(value, '__proto__'), true);
});

test('invalid immutable plans fail closed with Workflow Plan errors', () => {
  assert.throws(() => validateExecutionPlan({}), /execution plan workflow_id is required/);
  assert.throws(() => validateExecutionPlan({
    workflow_id: 'standard-engineering', workflow_version: 0, job_id: 'job_plan_api',
    phases: ['execution'], children: [], required_children: [], synthesis: { id: 'synthesis', role: 'cto', dependencies: [] }
  }), /invalid execution plan workflow_version/);
});

test('dependency verifier compares durable dependency bytes against immutable plan identities', () => {
  const task = { dependency_json: '["task-a","task-b"]' };
  const planTask = { dependencies: ['task-a', 'task-b'] };
  assert.deepEqual(assertTaskDependenciesMatchPlan(task, planTask), ['task-a', 'task-b']);
  assert.throws(() => assertTaskDependenciesMatchPlan({ dependency_json: '["task-a"]' }, planTask), /differ from the immutable execution plan/);
  assert.throws(() => assertTaskDependenciesMatchPlan({ dependency_json: '{' }, planTask), /are malformed/);
});

test('batch route helper keeps non-deterministic tasks outside the deterministic batch', () => {
  assert.deepEqual(resolveTaskBatchRoute({ schema_version: 2 }, { execution: { deterministic: false } }), {
    required: false, route: 'not-applicable', policy_version: null
  });
  assert.throws(() => resolveTaskBatchRoute({ schema_version: 2, batch_execution_policy: { mode: 'exempt', route: 'not-applicable' } }, {
    id: 'task_exec', execution: { deterministic: true, executor: 'ExecutionManager' }
  }), /conflicts with the immutable batch execution policy/);
});

test('host semantic verifier is injected through the same package module instance as plan validation', () => {
  assert.equal(typeof configureCompiledActionIntentSemanticVerifier, 'function');
  const verifier = () => {};
  assert.equal(configureCompiledActionIntentSemanticVerifier(verifier), undefined);
  assert.equal(configureCompiledActionIntentSemanticVerifier(verifier), undefined,
    'repeating the identical composition callback is idempotent');
  assert.throws(() => configureCompiledActionIntentSemanticVerifier(() => {}),
    /already configured and cannot be replaced/,
    'a later host cannot replace the semantic policy after package composition');
});
