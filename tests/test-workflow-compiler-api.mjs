import assert from 'node:assert/strict';
import test from 'node:test';
import { compileWorkflowPlan as packageDefaultCompiler, createWorkflowPlanCompiler } from '../src/runtime/workflow/compiler.js';

test('pure compiler creates immutable hash-bound engineering plans from detached jobs', () => {
  const compile = createWorkflowPlanCompiler();
  const plan = compile({ job_id: 'package-engineering', title: 'Engineering M4 package compiler' }, { workspace: '/tmp' });
  assert.equal(plan.workflow_id, 'engineering');
  assert.equal(Object.isFrozen(plan), true);
  assert.match(plan.plan_hash, /^[a-f0-9]{64}$/);
  assert.equal(plan.schema_version, 2);
  const defaultPlan = packageDefaultCompiler({ job_id: 'package-default-engineering', title: 'Engineering M4 default compiler' }, { workspace: '/tmp' });
  assert.equal(defaultPlan.workflow_id, 'engineering');
  assert.match(defaultPlan.plan_hash, /^[a-f0-9]{64}$/);
});

test('compiler preserves legacy pinned Workflow versions and custom workflow records', () => {
  const compile = createWorkflowPlanCompiler();
  const legacy = compile({ job_id: 'package-standard-v2', title: 'Software delivery: legacy compiler contract' }, {
    workspace: '/tmp', workflowVersion: 2
  });
  assert.equal(legacy.workflow_id, 'standard-engineering');
  assert.equal(legacy.workflow_version, 2);
  assert.equal(legacy.schema_version, 2);
  const custom = compile({ job_id: 'package-custom', title: 'Custom compiler contract' }, {
    workspace: '/tmp',
    customWorkflow: {
      plan_id: 'custom-plan-1', plan_hash: 'a'.repeat(64), approved_at: '2026-11-13T00:00:00.000Z',
      workflow: { workflow_id: 'custom-one', version: 1, tasks: [{ id: 'custom-task-1' }] },
      tasks: [{ id: 'custom-task-1', depends_on: [], role_id: 'custom-role', role_version: 1,
        role: { name: 'Custom role', description: 'Test', system_prompt: 'Use evidence.', skills: [], allowed_capabilities: ['artifact.create'], permissions: [], allowed_tools: [] },
        input_contract: { inputs: [], outputs: [] }, output_artifact_type: 'custom-output' }]
    }
  });
  assert.equal(custom.custom_workflow, true);
  assert.equal(custom.workflow_id, 'custom-custom-one');
  assert.match(custom.plan_hash, /^[a-f0-9]{64}$/);
});

test('production compilation requires explicit host-owned Production QA catalog injection', () => {
  const compile = createWorkflowPlanCompiler();
  assert.throws(() => compile({ job_id: 'package-production', title: 'Production E2E package compiler' }, { workspace: '/tmp' }),
    /PRODUCTION_WORKFLOW_CATALOG_REQUIRED/);
  assert.throws(() => createWorkflowPlanCompiler({ productionCatalog: {} }), /productionCatalog must provide/);
});

test('compiler rejects malformed options instead of coercing contracts', () => {
  const compile = createWorkflowPlanCompiler();
  assert.throws(() => compile({ job_id: 'bad-policy', title: 'Engineering M4' }, { policyPacks: {} }), /policyPacks must be an array/);
  assert.throws(() => compile({}), /job is required to compile execution plan/);
});
