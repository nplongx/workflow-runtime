import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CUSTOM_ROLE_ALLOWED_TOOLS,
  CUSTOM_ROLE_ARTIFACT_TYPES,
  CUSTOM_ROLE_CAPABILITIES,
  CUSTOM_ROLE_PERMISSIONS,
  customRoleFingerprint,
  customRoleSchema,
  normalizeCustomRoleDefinition
} from '../src/runtime/workflow/custom-role-contract.js';

const skillSnapshot = [{
  name: 'documentation-style', description: 'Style guide', source: { kind: 'local', location: 'fixture:documentation-style' },
  sha256: 'a'.repeat(64), instructions: 'Use explicit verification status.', files: []
}];
const valid = {
  role_id: 'release-coordinator', name: 'Release Coordinator',
  description: 'Collects typed release readiness evidence.', system_prompt: 'Review evidence; do not run commands.',
  input_contract: ['job.request', 'qa-report'], output_artifact_type: 'documentation',
  allowed_capabilities: ['documentation.write'], permissions: ['workspace.read', 'artifact.create'],
  allowed_tools: ['workflow_get', 'workflow_artifacts']
};

test('pure custom role normalizer preserves allowlisted definition and host skill snapshot', () => {
  const normalized = normalizeCustomRoleDefinition(valid, { skillsSnapshot: skillSnapshot });
  assert.deepEqual(normalized, { ...valid, skills: skillSnapshot });
  assert.deepEqual(CUSTOM_ROLE_PERMISSIONS, ['workspace.read', 'artifact.create']);
  assert.ok(CUSTOM_ROLE_CAPABILITIES.includes('documentation.write'));
  assert.ok(CUSTOM_ROLE_ALLOWED_TOOLS.includes('workflow_get'));
  assert.ok(CUSTOM_ROLE_ARTIFACT_TYPES.includes('documentation'));
});

test('partial update retains unchanged fields and exact existing skill snapshot', () => {
  const base = normalizeCustomRoleDefinition(valid, { skillsSnapshot: skillSnapshot });
  const updated = normalizeCustomRoleDefinition({ role_id: base.role_id, description: 'Updated description.' }, { partial: true, base });
  assert.equal(updated.description, 'Updated description.');
  assert.equal(updated.system_prompt, base.system_prompt);
  assert.deepEqual(updated.skills, base.skills);
  const cleared = normalizeCustomRoleDefinition({ role_id: base.role_id, skills: [] }, { partial: true, base, skillsSnapshot: [] });
  assert.deepEqual(cleared.skills, []);
});

test('custom role contract rejects reserved IDs, unsupported capabilities/tools/permissions and invalid outputs', () => {
  assert.throws(() => normalizeCustomRoleDefinition({ ...valid, role_id: 'engineer' }, { skillsSnapshot: [] }), /reserved/);
  assert.throws(() => normalizeCustomRoleDefinition({ ...valid, role_id: 'system-executor' }, { skillsSnapshot: [] }), /reserved/);
  assert.throws(() => normalizeCustomRoleDefinition({ ...valid, allowed_capabilities: ['code.execute'] }, { skillsSnapshot: [] }), /unsupported/);
  assert.throws(() => normalizeCustomRoleDefinition({ ...valid, allowed_tools: ['shell_exec'] }, { skillsSnapshot: [] }), /unsupported/);
  assert.throws(() => normalizeCustomRoleDefinition({ ...valid, permissions: ['workspace.write', 'artifact.create'] }, { skillsSnapshot: [] }), /unsupported/);
  assert.throws(() => normalizeCustomRoleDefinition({ ...valid, permissions: ['workspace.read'] }, { skillsSnapshot: [] }), /must include artifact.create/);
  assert.throws(() => normalizeCustomRoleDefinition({ ...valid, output_artifact_type: 'arbitrary-code' }, { skillsSnapshot: [] }), /output_artifact_type/);
});

test('pure contract requires caller-supplied skill snapshots and bounds snapshot count', () => {
  assert.throws(() => normalizeCustomRoleDefinition(valid), /skillsSnapshot must be supplied/);
  assert.throws(() => normalizeCustomRoleDefinition(valid, { skillsSnapshot: Array.from({ length: 9 }, () => ({})) }), /at most 8/);
});

test('JSON schema and legacy fingerprint stay deterministic', () => {
  const normalized = normalizeCustomRoleDefinition(valid, { skillsSnapshot: [] });
  assert.deepEqual(customRoleSchema().permissions.items.enum, ['workspace.read', 'artifact.create']);
  assert.match(customRoleFingerprint(normalized), /^[a-f0-9]{64}$/);
  assert.equal(customRoleFingerprint(normalized), customRoleFingerprint({ ...normalized }));
});
