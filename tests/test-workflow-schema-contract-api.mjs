import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorkflowDefinition } from '../src/runtime/workflow/schema-contract.js';
import * as fullSchema from '../src/runtime/workflow/schema.js';

test('public Workflow schema contract is the exact package-owned pure validator', () => {
  assert.equal(validateWorkflowDefinition, fullSchema.validateWorkflowDefinition);
  assert.equal(typeof validateWorkflowDefinition, 'function');
});

test('generic Workflow definition validation accepts valid detached definitions', () => {
  const definition = Object.freeze({
    id: 'example-workflow', version: 1,
    phases: Object.freeze(['plan', 'execute']),
    requiredChildren: Object.freeze(['architect', 'engineer'])
  });
  assert.equal(validateWorkflowDefinition(definition), definition);
});

test('generic Workflow definition validation rejects missing fields and duplicate identities', () => {
  assert.throws(() => validateWorkflowDefinition(null), /workflow definition id is required/);
  assert.throws(() => validateWorkflowDefinition({ id: 'bad' }), /invalid workflow version/);
  assert.throws(() => validateWorkflowDefinition({ id: 'bad', version: 1, phases: [], requiredChildren: [] }), /requires phases/);
  assert.throws(() => validateWorkflowDefinition({ id: 'bad', version: 1, phases: ['plan'], requiredChildren: null }), /requires requiredChildren/);
  assert.throws(() => validateWorkflowDefinition({ id: 'bad', version: 1, phases: ['plan', 'plan'], requiredChildren: [] }), /duplicate phases/);
  assert.throws(() => validateWorkflowDefinition({ id: 'bad', version: 1, phases: ['plan'], requiredChildren: ['task', 'task'] }), /duplicate child task IDs/);
});
