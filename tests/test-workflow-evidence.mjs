import assert from 'node:assert/strict';
import test from 'node:test';
import * as publicApi from '@runalith/workflow-runtime/evidence';
import * as implementation from '../src/runtime/workflow/evidence.js';

function fixture() {
  const task = {
    task_id: 'task-evidence-1', status: 'completed', execution_exit_code: 0,
    execution_status: 'completed', execution_stdout: 'compiled successfully\n', execution_stderr: '',
    execution_session_id: 'session-evidence-1', execution_attempt: 2,
    metadata_json: JSON.stringify({ executor: 'ExecutionManager', command: 'node build.js' })
  };
  const plannedExecution = { executor: 'ExecutionManager', command: 'node build.js' };
  const result = {
    outcome: 'success',
    content: publicApi.canonicalExecutionEvidenceContent({
      taskId: task.task_id,
      executionSessionId: task.execution_session_id,
      attempt: task.execution_attempt,
      command: 'node build.js',
      exitCode: 0,
      status: 'completed',
      stdout: task.execution_stdout,
      stderr: task.execution_stderr
    })
  };
  return { task, result, plannedExecution };
}

test('public evidence subpath directly re-exports the package-owned implementation', () => {
  assert.deepEqual(Object.keys(publicApi).sort(), Object.keys(implementation).sort());
  for (const name of Object.keys(implementation)) assert.equal(publicApi[name], implementation[name], name);
  assert.deepEqual(Object.keys(publicApi).sort(), [
    'canonicalExecutionEvidenceContent', 'executionEvidence', 'validateEvidenceContract'
  ]);
});

test('canonical evidence content binds exact task/session/attempt/command and stream bytes', () => {
  const { task, result } = fixture();
  for (const line of [
    '[ACTUAL TOOL RESULT EVIDENCE]', '[ACTUAL EXECUTION EVIDENCE]',
    'task_id: task-evidence-1', 'execution_session_id: session-evidence-1',
    'attempt: 2', 'exact command: node build.js', 'exit status/code: 0',
    'execution status: completed', 'stdout:\ncompiled successfully\n', 'stderr:\n'
  ]) assert.ok(result.content.includes(line), `missing canonical evidence content: ${line}`);
  assert.equal(publicApi.validateEvidenceContract(task, result, { executor: 'ExecutionManager', command: 'node build.js' }).valid, true);
});

test('detached evidence validator rejects lifecycle, execution, executor and result mismatches', () => {
  const { task, result, plannedExecution } = fixture();
  const invalidCases = [
    [{ ...task, status: 'failed' }, result, plannedExecution],
    [{ ...task, execution_status: 'failed' }, result, plannedExecution],
    [{ ...task, execution_exit_code: 1 }, result, plannedExecution],
    [{ ...task, execution_attempt: 0 }, result, plannedExecution],
    [{ ...task, execution_session_id: '' }, result, plannedExecution],
    [{ ...task, metadata_json: JSON.stringify({ executor: 'OtherExecutor', command: 'node build.js' }) }, result, plannedExecution],
    [task, { ...result, outcome: 'failure' }, plannedExecution]
  ];
  for (const args of invalidCases) assert.equal(publicApi.validateEvidenceContract(...args).valid, false);
});

test('immutable plan command binding rejects metadata and result substitution', () => {
  const { task, result, plannedExecution } = fixture();
  const taskCommandTamper = {
    ...task,
    metadata_json: JSON.stringify({ executor: 'ExecutionManager', command: 'node attacker.js' })
  };
  assert.ok(publicApi.validateEvidenceContract(taskCommandTamper, result, plannedExecution).errors
    .some(error => /does not match the immutable execution plan/u.test(error)));
  const planCommandTamper = { executor: 'ExecutionManager', command: 'node release.js' };
  assert.ok(publicApi.validateEvidenceContract(task, result, planCommandTamper).errors
    .some(error => /does not match the immutable expected command/u.test(error)));
  assert.ok(publicApi.validateEvidenceContract(task, { ...result, content: result.content.replace('compiled successfully', 'substituted') }, plannedExecution).errors
    .some(error => /canonical task\/session\/attempt\/command\/stdout\/stderr/u.test(error)));
});

test('malformed or duplicate-key task metadata fails closed', () => {
  const { task, result, plannedExecution } = fixture();
  for (const metadata_json of ['{', '{"executor":"ExecutionManager","executor":"OtherExecutor","command":"node build.js"}']) {
    const verdict = publicApi.validateEvidenceContract({ ...task, metadata_json }, result, plannedExecution);
    assert.equal(verdict.valid, false);
    assert.ok(verdict.errors.includes('executor must be ExecutionManager'));
  }
});

test('evidence APIs are pure over caller-supplied objects', () => {
  const { task, result, plannedExecution } = fixture();
  const before = JSON.stringify({ task, result, plannedExecution });
  publicApi.executionEvidence(task, result, plannedExecution);
  publicApi.validateEvidenceContract(task, result, plannedExecution);
  assert.equal(JSON.stringify({ task, result, plannedExecution }), before);
});
