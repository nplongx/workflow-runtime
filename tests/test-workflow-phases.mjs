import assert from 'node:assert/strict';
import test from 'node:test';
import { PRODUCTION_PHASES, WorkflowPhase } from '../src/runtime/workflow/phases.js';

const expected = [
  'PROPOSED', 'APPROVED', 'SPAWN_CTO', 'ASSIGN_CHILDREN', 'RUN_CHILDREN', 'WAIT',
  'VALIDATE_EVIDENCE', 'SYNTHESIZE', 'TERMINALIZE', 'PROJECT', 'COMPLETED', 'FAILED'
];

test('WorkflowPhase exposes the frozen exact lifecycle vocabulary', () => {
  assert.deepEqual(Object.values(WorkflowPhase), expected);
  assert.equal(Object.isFrozen(WorkflowPhase), true);
});

test('PRODUCTION_PHASES is the frozen phase sequence and has no duplicate identifiers', () => {
  assert.deepEqual(PRODUCTION_PHASES, expected);
  assert.equal(Object.isFrozen(PRODUCTION_PHASES), true);
  assert.equal(new Set(PRODUCTION_PHASES).size, PRODUCTION_PHASES.length);
  assert.deepEqual(PRODUCTION_PHASES, Object.values(WorkflowPhase));
});
