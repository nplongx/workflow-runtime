import assert from 'node:assert/strict';
import test from 'node:test';
import * as api from '../src/runtime/workflow/policy-contract-public-api.js';

const expectedExports = [
  'composePolicySuccessContract',
  'createPolicySnapshot',
  'getWorkflowPolicyCatalog',
  'inspectStoredWorkflowPolicyRow',
  'materializeValidationProfileTasks',
  'normalizePolicyDefinition',
  'policyRuleIdForSnapshot',
  'resolveValidationProfileSnapshot',
  'validatePolicySnapshot',
  'validateValidationProfileSnapshot'
].sort();

test('public policy contract exposes only pure normalization, snapshot, composition and validation APIs', () => {
  assert.deepEqual(Object.keys(api).sort(), expectedExports);
  for (const name of expectedExports) assert.equal(typeof api[name], 'function', `${name} must be callable`);
  for (const name of ['initializeWorkflowPolicyStore', 'createWorkflowPolicy', 'updateWorkflowPolicy',
    'getWorkflowPolicy', 'listWorkflowPolicies', 'attachWorkflowPolicy', 'getWorkflowPolicyEvents',
    'recordWorkflowPolicyViolation']) {
    assert.equal(Object.hasOwn(api, name), false, `${name} must remain outside the public pure API`);
  }
});

test('policy normalization and immutable snapshot hashing are deterministic and tamper-evident', () => {
  const definition = api.normalizePolicyDefinition({
    policy_id: 'secure-release', name: 'Secure release', description: 'Bounded policy.',
    constraints: [{ id: 'qa-present', type: 'task_role_present', role: 'qa' }],
    success_criteria: [{ id: 'qa-accepts', type: 'artifact_field_equals', artifact_type: 'qa-report', field: 'decision', expected: 'accept' }]
  });
  assert.equal(definition.schema_version, 1);
  const snapshot = api.createPolicySnapshot('secure-release', 3, definition);
  assert.deepEqual(api.validatePolicySnapshot(snapshot), snapshot);
  assert.throws(() => api.validatePolicySnapshot({ ...snapshot, version: 4 }), /hash mismatch/);
  assert.throws(() => api.normalizePolicyDefinition({ ...definition, executable: 'node' }), /unsupported fields/);
});

test('policy composition rejects contradictory predicates and invalid plan bindings', () => {
  const base = { goal: 'Release safely', success_criteria: [{ id: 'all-done', type: 'all_tasks_completed' }] };
  const needsQa = api.createPolicySnapshot('needs-qa', 1, {
    policy_id: 'needs-qa', name: 'Needs QA', constraints: [{ id: 'qa-present', type: 'task_role_present', role: 'qa' }]
  });
  assert.throws(() => api.composePolicySuccessContract(base, [needsQa], {
    workflowId: 'standard-engineering', children: [{ id: 'eng', role: 'engineer' }]
  }), /requires planned role qa/);
  const forbidsQa = api.createPolicySnapshot('forbids-qa', 1, {
    policy_id: 'forbids-qa', name: 'Forbids QA', constraints: [{ id: 'qa-absent', type: 'task_role_absent', role: 'qa' }]
  });
  assert.throws(() => api.composePolicySuccessContract(base, [needsQa, forbidsQa]), /conflicting policy predicates/);
});

test('catalog and stable policy predicate identifiers are read-only DTO helpers', () => {
  const catalog = api.getWorkflowPolicyCatalog();
  assert.equal(catalog.schema_version, 1);
  assert.ok(catalog.supported_rule_count > 0);
  assert.ok(catalog.rule_types.some(rule => rule.type === 'artifact_field_equals'));
  assert.equal(api.policyRuleIdForSnapshot('secure-release', 'qa-accepts'), 'p-secure-release-qa-accepts');
});

test('detached stored-row validation checks canonical bytes and immutable content hash', () => {
  const definition = api.normalizePolicyDefinition({
    policy_id: 'stored-policy', name: 'Stored Policy',
    constraints: [{ id: 'local-only', type: 'local_execution_only' }]
  });
  const snapshot = api.createPolicySnapshot('stored-policy', 1, definition);
  const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` :
    value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
  const row = {
    policy_id: snapshot.policy_id, version: snapshot.version, name: snapshot.name, description: snapshot.description,
    definition_json: canonical(definition), content_hash: snapshot.content_hash,
    created_at: '2026-01-01T00:00:00.000Z', created_by: 'test'
  };
  assert.equal(api.inspectStoredWorkflowPolicyRow(row).valid, true);
  assert.equal(api.inspectStoredWorkflowPolicyRow({ ...row, content_hash: '0'.repeat(64) }).valid, false);
  assert.equal(api.inspectStoredWorkflowPolicyRow({ ...row, definition_json: '{ "policy_id": "stored-policy" }' }).valid, false);
});

test('validation profiles are immutable snapshots and materialize only bounded local task DTOs', () => {
  const snapshot = api.resolveValidationProfileSnapshot({ profile_id: 'core-release-validation', profile_version: 1 });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(api.validateValidationProfileSnapshot(snapshot).content_hash, snapshot.content_hash);
  const tasks = api.materializeValidationProfileTasks(snapshot, '/tmp/workflow-policy-consumer');
  assert.ok(tasks.length > 0);
  assert.ok(tasks.every(task => task.execution.executor === 'ExecutionManager' && task.execution.local_only === true));
  assert.throws(() => api.materializeValidationProfileTasks(snapshot, ''), /concrete local workspace/);
});
