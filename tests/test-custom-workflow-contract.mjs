import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCustomWorkflowRoleLookupRequests,
  normalizeCustomWorkflowDefinition
} from '../src/runtime/workflow/custom-workflow-contract.js';

const roleSnapshotsByTaskId = {
  architect: { role_id: 'architecture-reviewer', version: 3, input_contract: ['job.request', 'requirements'], output_artifact_type: 'architecture' },
  engineer: { role_id: 'implementation-engineer', version: 2, input_contract: ['job.request', 'architecture'], output_artifact_type: 'implementation' }
};
const valid = {
  workflow_id: 'secure-delivery', name: 'Secure Delivery', description: 'Review and implement bounded changes.',
  input_contract: ['job.request'],
  tasks: [
    { id: 'architect', role_id: 'architecture-reviewer', role_version: 3, input_contract: ['job.request'], depends_on: [] },
    { id: 'engineer', role_id: 'implementation-engineer', role_version: 2, input_contract: ['job.request', 'architecture'], depends_on: ['architect'] }
  ]
};

test('custom Workflow role lookup requests preserve task IDs and exact optional version pins', () => {
  assert.deepEqual(getCustomWorkflowRoleLookupRequests(valid), [
    { task_id: 'architect', role_id: 'architecture-reviewer', role_version: 3 },
    { task_id: 'engineer', role_id: 'implementation-engineer', role_version: 2 }
  ]);
});

test('custom Workflow normalizer preserves canonical role versions and DAG DTOs', () => {
  const result = normalizeCustomWorkflowDefinition(valid, { roleSnapshotsByTaskId });
  assert.deepEqual(result, {
    workflow_id: 'secure-delivery', name: 'Secure Delivery', description: 'Review and implement bounded changes.',
    input_contract: ['job.request'],
    tasks: [
      { id: 'architect', role_id: 'architecture-reviewer', role_version: 3, input_contract: ['job.request'], output_artifact_type: 'architecture', depends_on: [] },
      { id: 'engineer', role_id: 'implementation-engineer', role_version: 2, input_contract: ['job.request', 'architecture'], output_artifact_type: 'implementation', depends_on: ['architect'] }
    ]
  });
});

test('normalizer fails closed on reserved IDs, unsupported fields, duplicate tasks and role identity/version drift', () => {
  assert.throws(() => getCustomWorkflowRoleLookupRequests({ ...valid, workflow_id: 'production' }), /conflicts with a built-in workflow/);
  assert.throws(() => getCustomWorkflowRoleLookupRequests({ ...valid, executable: 'node' }), /unsupported fields/);
  assert.throws(() => getCustomWorkflowRoleLookupRequests({ ...valid, tasks: [valid.tasks[0], valid.tasks[0]] }), /duplicate task id/);
  assert.throws(() => normalizeCustomWorkflowDefinition(valid, { roleSnapshotsByTaskId: {} }), /role snapshot is missing/);
  assert.throws(() => normalizeCustomWorkflowDefinition(valid, { roleSnapshotsByTaskId: { ...roleSnapshotsByTaskId, architect: { ...roleSnapshotsByTaskId.architect, role_id: 'forged-role' } } }), /identity mismatch/);
  assert.throws(() => normalizeCustomWorkflowDefinition(valid, { roleSnapshotsByTaskId: { ...roleSnapshotsByTaskId, architect: { ...roleSnapshotsByTaskId.architect, version: 4 } } }), /version mismatch/);
});

test('normalizer rejects unsupported role inputs, output mismatch, dangling dependencies and cycles', () => {
  assert.throws(() => normalizeCustomWorkflowDefinition({ ...valid, tasks: [{ ...valid.tasks[0], input_contract: ['job.request', 'qa-report'] }] }, { roleSnapshotsByTaskId }), /not supported by role/);
  assert.throws(() => normalizeCustomWorkflowDefinition({ ...valid, tasks: [{ ...valid.tasks[0], output_artifact_type: 'qa-report' }] }, { roleSnapshotsByTaskId }), /does not match pinned role/);
  assert.throws(() => normalizeCustomWorkflowDefinition({ ...valid, tasks: [{ ...valid.tasks[0], depends_on: ['missing'] }] }, { roleSnapshotsByTaskId }), /depends on unknown task/);
  const cyclic = { ...valid, tasks: [
    { ...valid.tasks[0], input_contract: ['job.request', 'implementation'], depends_on: ['engineer'] },
    { ...valid.tasks[1], input_contract: ['job.request', 'architecture'], depends_on: ['architect'] }
  ] };
  const cycleSnapshots = {
    ...roleSnapshotsByTaskId,
    architect: { ...roleSnapshotsByTaskId.architect, input_contract: ['job.request', 'implementation'] }
  };
  assert.throws(() => normalizeCustomWorkflowDefinition(cyclic, { roleSnapshotsByTaskId: cycleSnapshots }), /dependency cycle detected/);
});
