import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as publicApi from '@runalith/workflow-runtime/role-profiles';
import * as implementation from '../src/runtime/workflow/role-profiles.js';
import { createCustomRole, initializeCustomRoleStore, updateCustomRole } from '../src/runtime/workflow/custom-roles.js';

function fixtureProfile(overrides = {}) {
  return {
    role_id: 'architecture-profile',
    name: 'Architecture Profile',
    description: 'Supplementary architecture guidance.',
    system_prompt: 'Use evidence and document constraints.',
    input_contract: ['job.request', 'requirements', 'research'],
    output_artifact_type: 'architecture',
    allowed_capabilities: ['architecture.design'],
    permissions: ['workspace.read', 'artifact.create'],
    allowed_tools: ['workflow_get'],
    skills: [],
    ...overrides
  };
}

async function withRoleDatabase(run) {
  const db = new DatabaseSync(':memory:');
  try {
    initializeCustomRoleStore(db);
    return await run(db);
  } finally {
    db.close();
  }
}

test('public role-profile subpath is the package-owned implementation', () => {
  assert.deepEqual(Object.keys(publicApi).sort(), Object.keys(implementation).sort());
  for (const name of Object.keys(implementation)) assert.equal(publicApi[name], implementation[name], name);
  assert.equal(Object.isFrozen(publicApi.BUILTIN_ROLE_PROFILE_OVERLAY_ROLES), true);
});

test('binding normalization and resolution require explicit immutable custom-role versions', async () => {
  await withRoleDatabase(async db => {
    await createCustomRole(db, fixtureProfile());
    const versionOne = publicApi.normalizeRoleProfileBindings(db, 'standard-engineering', [
      { role: 'architect', custom_role_id: 'architecture-profile', custom_role_version: 1 }
    ]);
    assert.equal(versionOne.length, 1);
    assert.equal(versionOne[0].custom_role_version, 1);
    assert.match(versionOne[0].profile_hash, /^[a-f0-9]{64}$/);

    await updateCustomRole(db, 'architecture-profile', { system_prompt: 'Version two only.' });
    const resolved = publicApi.resolveRoleProfileBindings(db, versionOne);
    assert.equal(resolved[0].profile.version, 1);
    assert.equal(resolved[0].profile.system_prompt, 'Use evidence and document constraints.');
    assert.equal(resolved[0].profile_hash, versionOne[0].profile_hash);
  });
});

test('profile hash pins only the detached overlay snapshot, never permissions or tool grants', () => {
  const profile = fixtureProfile({ version: 1 });
  const baseHash = publicApi.roleProfileHash(profile);
  const changedAuthorityFields = {
    ...profile,
    permissions: ['workspace.read'],
    allowed_capabilities: ['security.audit'],
    allowed_tools: ['workflow_catalog', 'workflow_list']
  };
  assert.equal(publicApi.roleProfileHash(changedAuthorityFields), baseHash);
  const snapshot = publicApi.roleProfileSnapshot(profile);
  assert.deepEqual(Object.keys(snapshot).sort(), [
    'input_contract', 'name', 'output_artifact_type', 'role_id', 'skills', 'system_prompt', 'version'
  ]);
  assert.equal(Object.hasOwn(snapshot, 'permissions'), false);
  assert.equal(Object.hasOwn(snapshot, 'allowed_capabilities'), false);
  assert.equal(Object.hasOwn(snapshot, 'allowed_tools'), false);
});

test('task overlays validate against built-in input/output contracts and their pinned hash', () => {
  const profile = fixtureProfile({ version: 1 });
  const hash = publicApi.roleProfileHash(profile);
  const overlay = publicApi.createRoleProfileOverlay('architect', profile, hash);
  assert.equal(publicApi.validateRoleProfileOverlay('architect', overlay), true);
  assert.throws(() => publicApi.validateRoleProfileOverlay('architect', { ...overlay, profile_hash: '0'.repeat(64) }), /hash mismatch/);
  assert.throws(() => publicApi.createRoleProfileOverlay('architect', { ...profile, output_artifact_type: 'research' }), /does not match built-in role architect output/);
  assert.throws(() => publicApi.createRoleProfileOverlay('architect', { ...profile, input_contract: ['job.request', 'requirements'] }), /does not cover built-in role architect inputs: research/);
  assert.throws(() => publicApi.createRoleProfileOverlay('cto', profile), /not supported for built-in role: cto/);
});

test('binding validation rejects duplicate roles, unsupported workflows and non-explicit versions', () => {
  return withRoleDatabase(async db => {
    await createCustomRole(db, fixtureProfile());
    assert.throws(() => publicApi.normalizeRoleProfileBindings(db, 'standard-engineering', [
      { role: 'architect', custom_role_id: 'architecture-profile', custom_role_version: 1 },
      { role: 'architect', custom_role_id: 'architecture-profile', custom_role_version: 1 }
    ]), /duplicate role profile binding/);
    assert.throws(() => publicApi.normalizeRoleProfileBindings(db, 'production', [
      { role: 'architect', custom_role_id: 'architecture-profile', custom_role_version: 1 }
    ]), /supported only for standard-engineering and hybrid-engineering/);
    assert.throws(() => publicApi.normalizeRoleProfileBindings(db, 'standard-engineering', [
      { role: 'architect', custom_role_id: 'architecture-profile', custom_role_version: null }
    ]), /positive integer; latest is not implicit/);
    assert.throws(() => publicApi.normalizeRoleProfileBindings(db, 'standard-engineering', [
      { role: 'architect', custom_role_id: 'architecture-profile', custom_role_version: 1, permissions: ['workspace.write'] }
    ]), /must contain only role, custom_role_id, and custom_role_version/);
  });
});

test('role-profile API performs read-only lookups through the caller-owned database', async () => {
  await withRoleDatabase(async db => {
    await createCustomRole(db, fixtureProfile());
    const before = db.prepare('SELECT COUNT(*) AS count FROM custom_role_versions').get().count;
    const pins = publicApi.normalizeRoleProfileBindings(db, 'standard-engineering', [
      { role: 'architect', custom_role_id: 'architecture-profile', custom_role_version: 1 }
    ]);
    publicApi.resolveRoleProfileBindings(db, pins);
    const after = db.prepare('SELECT COUNT(*) AS count FROM custom_role_versions').get().count;
    assert.equal(after, before);
  });
});
