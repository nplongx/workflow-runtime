import assert from 'node:assert/strict';
import test from 'node:test';
import { getRoleContract, validateRoleContract, TaskCapability, ROLE_CONTRACTS } from '../src/runtime/workflow/roles.js';

const expectedRoles = ['productowner', 'product-owner', 'researcher', 'architect', 'engineer', 'qa', 'reviewer', 'security', 'platform', 'writer', 'cto'];

test('task capabilities and built-in role descriptors are frozen', () => {
  assert.equal(Object.isFrozen(TaskCapability), true);
  assert.equal(Object.isFrozen(ROLE_CONTRACTS), true);
  for (const role of expectedRoles) assert.equal(Object.isFrozen(ROLE_CONTRACTS[role]), true);
});

test('all built-in Workflow roles resolve to canonical public Agent Contracts', () => {
  for (const role of expectedRoles) {
    const contract = getRoleContract(role);
    const canonicalRole = role === 'productowner' ? 'product-owner' : role;
    assert.equal(contract.id, `agent.${canonicalRole}`);
    assert.equal(contract.role, canonicalRole);
    assert.equal(contract.executor, 'ChatOnSteroids');
    assert.ok(contract.capability);
    assert.ok(Object.isFrozen(contract));
  }
});

test('role validation enforces capability and executor labels without granting authority', () => {
  assert.equal(validateRoleContract('engineer', { capability: TaskCapability.CODE_MODIFY }).id, 'agent.engineer');
  assert.throws(() => validateRoleContract('engineer', { capability: TaskCapability.SECURITY_AUDIT }), /does not support capability/);
  assert.throws(() => validateRoleContract('reviewer', { executor: 'OpenClaw' }), /requires executor ChatOnSteroids/);
  assert.throws(() => getRoleContract('not-a-role'), /unknown workflow role/);
});

test('legacy productowner alias resolves to canonical product-owner Agent Contract', () => {
  assert.equal(getRoleContract('productowner').id, getRoleContract('product-owner').id);
  assert.equal(ROLE_CONTRACTS.productowner.role, 'productowner');
});
