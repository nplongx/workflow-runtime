import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as agentContracts from '@runalith/agent-contracts';
import * as agentCompatibility from '../src/runtime/agent-contracts-public-api.js';
import * as workspaceFilesystem from '@runalith/workspace-runtime/filesystem';
import * as filesystemCompatibility from '../src/runtime/secure-filesystem.js';
import * as publicApi from '@runalith/workflow-runtime/workspace-write-contract';
import * as publicAgentContracts from '@runalith/workflow-runtime/agent-contracts';
import * as workflowPlan from '@runalith/workflow-runtime/workflow-plan';
import * as implementation from '../src/runtime/workflow/workspace-write-contract.js';

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-write-contract-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-write-contract-outside-'));
  try {
    fs.mkdirSync(path.join(root, 'src'), { mode: 0o700 });
    fs.writeFileSync(path.join(root, 'src', 'main.js'), 'unchanged\n', { mode: 0o600, flag: 'wx' });
    fs.writeFileSync(path.join(outside, 'secret.js'), 'outside\n', { mode: 0o600, flag: 'wx' });
    fs.symlinkSync(path.join(outside, 'secret.js'), path.join(root, 'src', 'linked.js'));
    return run({ root, outside });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
}

test('Workflow write contract subpath and legacy module directly expose the same package implementation', () => {
  assert.deepEqual(Object.keys(publicApi).sort(), Object.keys(implementation).sort());
  for (const name of Object.keys(implementation)) assert.equal(publicApi[name], implementation[name], name);
  assert.deepEqual(Object.keys(publicApi).sort(), [
    'WorkspaceWriteContractError', 'normalizeWorkspaceWriteContract',
    'pathIsWithinWorkspaceWriteScope', 'workspaceWriteScopeForRole'
  ]);
});

test('Agent Contracts and descriptor-anchored filesystem compatibility paths have one public owner each', () => {
  assert.deepEqual(Object.keys(agentCompatibility).sort(), Object.keys(agentContracts).sort());
  for (const name of Object.keys(agentContracts)) assert.equal(agentCompatibility[name], agentContracts[name], name);
  assert.deepEqual(Object.keys(filesystemCompatibility).sort(), Object.keys(workspaceFilesystem).sort());
  for (const name of Object.keys(workspaceFilesystem)) assert.equal(filesystemCompatibility[name], workspaceFilesystem[name], name);
});

test('Workflow compiled Agent Contracts subpath and Workflow Plan API share one injected verifier closure', () => {
  assert.equal(publicAgentContracts.configureCompiledActionIntentSemanticVerifier,
    workflowPlan.configureCompiledActionIntentSemanticVerifier);
  assert.equal(typeof publicAgentContracts.validateCompiledActionIntent, 'function');
  assert.equal(typeof publicAgentContracts.getAgentContract, 'function');
  assert.equal(typeof publicAgentContracts.getAgentArtifactType, 'function');
});

test('workspace write normalization checks explicit role/path scopes without mutating the workspace', () => {
  fixture(({ root, outside }) => {
    const before = fs.readFileSync(path.join(root, 'src', 'main.js'));
    const outsideBefore = fs.readFileSync(path.join(outside, 'secret.js'));
    const contract = publicApi.normalizeWorkspaceWriteContract({
      workflowId: 'standard-engineering',
      workflowVersion: 3,
      workspace: root,
      requiredOperations: ['workspace.write'],
      scopes: [{ role: 'engineer', paths: [{ path: 'src', kind: 'directory' }] }]
    });
    assert.deepEqual(contract.required_operations, ['workspace.write']);
    assert.deepEqual(publicApi.workspaceWriteScopeForRole(contract, 'engineer'), contract.scopes[0]);
    assert.equal(publicApi.workspaceWriteScopeForRole(contract, 'writer'), null);
    assert.equal(publicApi.pathIsWithinWorkspaceWriteScope('src/main.js', contract.scopes[0]), true);
    assert.equal(publicApi.pathIsWithinWorkspaceWriteScope('tests/main.js', contract.scopes[0]), false);
    assert.equal(publicApi.pathIsWithinWorkspaceWriteScope('src/../outside.js', contract.scopes[0]), false);
    assert.deepEqual(fs.readFileSync(path.join(root, 'src', 'main.js')), before);
    assert.deepEqual(fs.readFileSync(path.join(outside, 'secret.js')), outsideBefore);
  });
});

test('workspace write contract rejects unsupported operations, workflows, roles and symlink scope targets', () => {
  fixture(({ root }) => {
    const base = { workflowId: 'standard-engineering', workflowVersion: 3, workspace: root };
    assert.throws(() => publicApi.normalizeWorkspaceWriteContract({
      ...base, requiredOperations: ['workspace.write'], scopes: []
    }), error => error.code === 'WORKSPACE_WRITE_SCOPE_MISSING');
    assert.throws(() => publicApi.normalizeWorkspaceWriteContract({
      ...base, requiredOperations: ['execution.request']
    }), error => error.code === 'WORKFLOW_OPERATION_UNSUPPORTED');
    assert.throws(() => publicApi.normalizeWorkspaceWriteContract({
      ...base, workflowId: 'production', requiredOperations: ['workspace.write'],
      scopes: [{ role: 'engineer', paths: [{ path: 'src', kind: 'directory' }] }]
    }), error => error.code === 'WORKSPACE_WRITE_UNSUPPORTED_WORKFLOW');
    assert.throws(() => publicApi.normalizeWorkspaceWriteContract({
      ...base, requiredOperations: ['workspace.write'],
      scopes: [{ role: 'reviewer', paths: [{ path: 'src', kind: 'directory' }] }]
    }), error => error.code === 'WORKSPACE_WRITE_ROLE_NOT_AUTHORIZED');
    assert.throws(() => publicApi.normalizeWorkspaceWriteContract({
      ...base, requiredOperations: ['workspace.write'],
      scopes: [{ role: 'engineer', paths: [{ path: 'src/linked.js', kind: 'file' }] }]
    }), error => error.code === 'WORKSPACE_WRITE_SCOPE_INVALID');
    assert.throws(() => publicApi.normalizeWorkspaceWriteContract({
      ...base, customWorkflow: true, requiredOperations: ['workspace.write'],
      scopes: [{ role: 'engineer', paths: [{ path: 'src', kind: 'directory' }] }]
    }), error => error.code === 'WORKSPACE_WRITE_UNSUPPORTED_WORKFLOW');
  });
});

test('Agent capability declarations do not create a workspace write approval or mutation authority', () => {
  assert.ok(agentContracts.getAgentContract('engineer').permissions.includes('workspace.write'));
  assert.ok(agentContracts.getAgentContract('writer').permissions.includes('workspace.write'));
  assert.equal(typeof publicApi.normalizeWorkspaceWriteContract, 'function');
  assert.equal(Object.hasOwn(publicApi, 'applyWrite'), false);
  assert.equal(Object.hasOwn(publicApi, 'approve'), false);
});
