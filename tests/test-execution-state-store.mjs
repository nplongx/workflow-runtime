import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  EXECUTION_STATE_STORE_VERSION,
  EXECUTION_STATE_TABLES,
  EXECUTION_STATE_WRITE_METHODS,
  ExecutionStateStore
} from '../src/runtime/execution-state-store.js';
import { createExecutionStatePort, assertExecutionStatePort } from '../src/runtime/execution-state-port.js';
import { createExecutionStateParticipant, assertExecutionStateParticipant } from '../src/runtime/execution-state-participant.js';
import { ExecutionPersistenceStore } from '../src/runtime/execution-persistence-store.js';
import { createWorkflowStatePort } from '../src/runtime/workflow-state-port.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createWorkflowParents(db) {
  db.exec(`
    CREATE TABLE jobs (job_id TEXT PRIMARY KEY);
    CREATE TABLE tasks (task_id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(job_id));
  `);
}

{
  const db = new DatabaseSync(':memory:');
  const otherDb = new DatabaseSync(':memory:');
  try {
    createWorkflowParents(db);
    const store = new ExecutionStateStore(db);
    assert.equal(store.version, EXECUTION_STATE_STORE_VERSION);
    assert.equal(EXECUTION_STATE_STORE_VERSION, 1);
    assert.deepEqual(EXECUTION_STATE_TABLES, [
      'attempts', 'results', 'execution_batches', 'execution_batch_items', 'task_checkpoints'
    ]);
    for (const method of EXECUTION_STATE_WRITE_METHODS) {
      assert.equal(typeof store[method], 'function', `missing ExecutionStateStore write primitive ${method}`);
    }
    assert.equal(store.assertSharedConnection(db), true);
    assert.throws(() => store.assertSharedConnection(otherDb), /ExecutionStateStore SQLite connection/);
    assert.equal(Object.hasOwn(store, 'db'), false);

    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    for (const table of EXECUTION_STATE_TABLES) assert.ok(tables.has(table), `missing Execution-owned table ${table}`);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_execution_batches_job'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_execution_batch_items_task'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_task_checkpoints_attempt'").get());

    // Reinitialization is idempotent and retains the same schema owner.
    assert.doesNotThrow(() => new ExecutionStateStore(db));
  } finally {
    db.close();
    otherDb.close();
  }
}

{
  const db = new DatabaseSync(':memory:');
  try {
    createWorkflowParents(db);
    const store = new ExecutionStateStore(db);
    db.prepare('INSERT INTO jobs(job_id) VALUES(?)').run('job-attempts');
    db.prepare('INSERT INTO tasks(task_id,job_id) VALUES(?,?)').run('task-attempts', 'job-attempts');

    const startedAt = '2026-11-13T00:00:00.000Z';
    const finishedAt = '2026-11-13T00:00:02.000Z';
    store.insertAttempt({ attemptId: 'attempt-status', taskId: 'task-attempts', status: 'started', startedAt });
    assert.equal(store.updateAttemptStatusByIdentity({ attemptId: 'attempt-status', taskId: 'task-attempts',
      status: 'completed', finishedAt, error: null }).changes, 1);
    assert.equal(store.getAttempt('attempt-status').status, 'completed');
    assert.equal(store.updateAttemptStatusByIdentity({ attemptId: 'attempt-status', taskId: 'other-task',
      expectedStatus: 'started', status: 'failed', finishedAt }).changes, 0);

    store.insertAttempt({ attemptId: 'attempt-active', taskId: 'task-attempts', status: 'started', startedAt });
    assert.equal(store.updateActiveAttemptsForTask({ taskId: 'task-attempts', status: 'failed', finishedAt }).changes, 1);
    assert.equal(store.getAttempt('attempt-active').status, 'failed');

    store.insertAttempt({ attemptId: 'attempt-stale', taskId: 'task-attempts', status: 'started', startedAt });
    assert.equal(store.updateAttemptStatusBefore({ attemptId: 'attempt-stale', cutoff: '2026-11-13T00:00:01.000Z',
      status: 'timeout', finishedAt, error: 'stale' }).changes, 1);
    assert.equal(store.getAttempt('attempt-stale').status, 'timeout');

    store.insertAttempt({ attemptId: 'attempt-bind', taskId: 'task-attempts', status: 'started', startedAt });
    assert.equal(store.bindAttemptRunIdIfUnbound({ attemptId: 'attempt-bind', runId: 'run-1' }).changes, 1);
    assert.equal(store.bindAttemptRunIdIfUnbound({ attemptId: 'attempt-bind', runId: 'run-2' }).changes, 0);
    assert.equal(store.bindStartedAttemptRunId({ attemptId: 'attempt-bind', taskId: 'task-attempts', runId: 'run-1' }).changes, 1);
    assert.equal(store.setAttemptRunId({ attemptId: 'attempt-bind', runId: 'run-3' }).changes, 1);
    assert.equal(store.getAttempt('attempt-bind').openclaw_run_id, 'run-3');
  } finally {
    db.close();
  }
}

{
  const db = new DatabaseSync(':memory:');
  try {
    createWorkflowParents(db);
    const store = new ExecutionStateStore(db);
    db.prepare('INSERT INTO jobs(job_id) VALUES(?)').run('job-batches');
    db.prepare('INSERT INTO tasks(task_id,job_id) VALUES(?,?)').run('task-batch-1', 'job-batches');
    db.prepare('INSERT INTO tasks(task_id,job_id) VALUES(?,?)').run('task-batch-2', 'job-batches');
    const createdAt = '2026-11-13T00:00:00.000Z';
    const finishedAt = '2026-11-13T00:00:05.000Z';

    assert.equal(store.insertExecutionBatch({ batchId: 'batch-retry', jobId: 'job-batches', role: 'executor',
      attempt: 1, createdAt, startedAt: createdAt }).changes, 1);
    store.insertExecutionBatchItem({ batchId: 'batch-retry', itemId: 'item-kept', taskId: 'task-batch-1',
      command: 'true', attempt: 1 });
    store.insertExecutionBatchItem({ batchId: 'batch-retry', itemId: 'item-retry', taskId: 'task-batch-2',
      command: 'false', attempt: 1 });
    db.prepare("UPDATE execution_batches SET status='FAILED' WHERE batch_id=?").run('batch-retry');
    db.prepare("UPDATE execution_batch_items SET status='COMPLETED',execution_session_id='session-1',exit_code=0 WHERE batch_id=? AND item_id=?")
      .run('batch-retry', 'item-kept');
    db.prepare("UPDATE execution_batch_items SET status='FAILED',error='retry' WHERE batch_id=? AND item_id=?")
      .run('batch-retry', 'item-retry');

    assert.equal(store.reserveExecutionBatchForRetry('batch-retry').changes, 1);
    assert.equal(store.retryExecutionBatch({ batchId: 'batch-retry', expectedAttempt: 1, nextAttempt: 2,
      startedAt: finishedAt }).changes, 1);
    assert.equal(store.resetIncompleteExecutionBatchItemsForRetry('batch-retry').changes, 1);
    const retryItems = store.listExecutionBatchItems('batch-retry');
    assert.equal(retryItems.find(item => item.item_id === 'item-kept').attempt, 1);
    assert.equal(retryItems.find(item => item.item_id === 'item-retry').attempt, 2);
    assert.equal(retryItems.find(item => item.item_id === 'item-retry').status, 'PENDING');
    assert.equal(store.reserveExecutionBatchForAttempt({ batchId: 'batch-retry', attempt: 2 }).changes, 1);
    assert.equal(store.claimExecutionBatchItem({ batchId: 'batch-retry', itemId: 'item-retry',
      expectedAttempt: 2, startedAt: finishedAt }).changes, 1);
    assert.equal(store.claimExecutionBatchItem({ batchId: 'batch-retry', itemId: 'item-retry',
      expectedAttempt: 2, startedAt: finishedAt }).changes, 0);

    assert.equal(store.finishExecutionBatchItem({ batchId: 'batch-retry', itemId: 'item-retry',
      expectedAttempt: 2, status: 'COMPLETED', executionSessionId: 'session-2', exitCode: 0,
      stdout: 'ok', stderr: '', error: null, finishedAt }).changes, 1);
    assert.equal(store.finishExecutionBatchItem({ batchId: 'batch-retry', itemId: 'item-retry',
      expectedAttempt: 2, status: 'FAILED', executionSessionId: null, exitCode: 1,
      stdout: '', stderr: 'late', error: 'late duplicate', finishedAt }).changes, 0);
    assert.equal(store.finishExecutionBatch({ batchId: 'batch-retry', expectedAttempt: 2,
      status: 'COMPLETED', finishedAt, aggregateContent: 'ok' }).changes, 1);
    assert.equal(store.getExecutionBatch('batch-retry').status, 'COMPLETED');

    store.insertExecutionBatch({ batchId: 'batch-cancel', jobId: 'job-batches', role: 'executor',
      attempt: 1, createdAt, startedAt: createdAt });
    store.insertExecutionBatchItem({ batchId: 'batch-cancel', itemId: 'item-cancel', taskId: 'task-batch-1',
      command: 'true', attempt: 1 });
    assert.equal(store.reserveExecutionBatchForCancellation('batch-cancel').changes, 1);
    assert.equal(store.cancelIncompleteExecutionBatchItems({ batchId: 'batch-cancel', reason: 'cancelled', finishedAt }).changes, 1);
    assert.equal(store.cancelExecutionBatch({ batchId: 'batch-cancel', reason: 'cancelled', finishedAt }).changes, 1);
    assert.equal(store.getExecutionBatch('batch-cancel').status, 'CANCELLED');
    assert.equal(store.listExecutionBatchItems('batch-cancel')[0].status, 'CANCELLED');

    store.insertExecutionBatch({ batchId: 'batch-wait', jobId: 'job-batches', role: 'executor',
      attempt: 1, createdAt, startedAt: createdAt });
    store.insertExecutionBatchItem({ batchId: 'batch-wait', itemId: 'item-stale', taskId: 'task-batch-2',
      command: 'false', attempt: 1 });
    assert.equal(store.reserveExecutionBatchForAttempt({ batchId: 'batch-wait', attempt: 1 }).changes, 1);
    assert.equal(store.claimExecutionBatchItem({ batchId: 'batch-wait', itemId: 'item-stale',
      expectedAttempt: 1, startedAt: createdAt }).changes, 1);
    assert.equal(store.failUnstartedExecutionBatchItem({ batchId: 'batch-wait', itemId: 'item-stale',
      taskId: 'task-batch-2', expectedAttempt: 1, startedBefore: finishedAt,
      reason: 'unstarted recovery', finishedAt }).changes, 1);
    assert.equal(store.failUnstartedExecutionBatchItem({ batchId: 'batch-wait', itemId: 'item-stale',
      taskId: 'task-batch-2', expectedAttempt: 1, startedBefore: finishedAt,
      reason: 'duplicate recovery', finishedAt }).changes, 0);
    assert.equal(store.listExecutionBatchItems('batch-wait')[0].status, 'FAILED');

    store.insertExecutionBatch({ batchId: 'batch-stale', jobId: 'job-batches', role: 'executor',
      attempt: 1, createdAt, startedAt: createdAt });
    store.insertExecutionBatchItem({ batchId: 'batch-stale', itemId: 'item-stale-runtime', taskId: 'task-batch-2',
      command: 'false', attempt: 1 });
    assert.equal(store.reserveExecutionBatchForAttempt({ batchId: 'batch-stale', attempt: 1 }).changes, 1);
    assert.equal(store.claimExecutionBatchItem({ batchId: 'batch-stale', itemId: 'item-stale-runtime',
      expectedAttempt: 1, startedAt: createdAt }).changes, 1);
    assert.equal(store.failRunningExecutionBatchItem({ batchId: 'batch-stale', itemId: 'item-stale-runtime',
      taskId: 'task-batch-2', expectedAttempt: 1, reason: 'stale session', finishedAt }).changes, 1);
    assert.equal(store.failRunningExecutionBatchItem({ batchId: 'batch-stale', itemId: 'item-stale-runtime',
      taskId: 'task-batch-2', expectedAttempt: 1, reason: 'late duplicate', finishedAt }).changes, 0);
    assert.equal(store.listExecutionBatchItems('batch-stale')[0].status, 'FAILED');
    assert.equal(store.markExecutionBatchWaiting('batch-wait').changes, 1);
    assert.equal(store.getExecutionBatch('batch-wait').status, 'WAITING');
    assert.equal(store.reserveExecutionBatchForAttempt({ batchId: 'batch-wait', attempt: 1 }).changes, 1);
    assert.equal(store.reserveExecutionBatchForAttempt({ batchId: 'batch-wait', attempt: 2 }).changes, 0);
  } finally {
    db.close();
  }
}

{
  const db = new DatabaseSync(':memory:');
  try {
    createWorkflowParents(db);
    const stateStore = new ExecutionStateStore(db);
    const participant = createExecutionStateParticipant(stateStore);
    assert.equal(assertExecutionStateParticipant(participant), participant);
    assert.equal(Object.isFrozen(participant), true);
    assert.equal(Object.hasOwn(participant, 'db'), false);
    assert.equal(Object.hasOwn(participant, 'transaction'), false);
    assert.equal(typeof participant.prepare, 'undefined');
    assert.equal(typeof participant.exec, 'undefined');
    db.prepare('INSERT INTO jobs(job_id) VALUES(?)').run('job-1');
    db.prepare('INSERT INTO tasks(task_id,job_id) VALUES(?,?)').run('task-1', 'job-1');
    db.prepare('INSERT INTO tasks(task_id,job_id) VALUES(?,?)').run('task-participant', 'job-1');
    participant.insertAttempt({ attemptId: 'attempt-participant', taskId: 'task-participant',
      status: 'started', startedAt: '2026-11-13T00:00:00.000Z' });
    assert.equal(stateStore.getAttempt('attempt-participant').status, 'started');
    db.prepare(`INSERT INTO execution_batches(batch_id,job_id,parent_task_id,role,status,attempt,created_at,started_at)
      VALUES(?,?,?,?,?,?,?,?)`).run('batch-1', 'job-1', null, 'executor', 'RUNNING', 1, '2026-11-13T00:00:00.000Z', '2026-11-13T00:00:00.000Z');
    db.prepare(`INSERT INTO execution_batch_items(batch_id,item_id,task_id,command,status)
      VALUES(?,?,?,?,?)`).run('batch-1', 'item-1', 'task-1', 'true', 'RUNNING');
    stateStore.insertAttempt({ attemptId: 'attempt-1', taskId: 'task-1', status: 'started', startedAt: '2026-11-13T00:00:00.000Z' });
    stateStore.insertResult({ resultId: 'result-1', taskId: 'task-1', outcome: 'success', content: 'ok', createdAt: '2026-11-13T00:00:01.000Z' });
    stateStore.insertTaskCheckpoint({ checkpointId: 'checkpoint-1', taskId: 'task-1', jobId: 'job-1',
      attempt: 1, checkpointCommit: 'a'.repeat(40), createdAt: '2026-11-13T00:00:02.000Z' });

    const port = createExecutionStatePort(stateStore);
    assert.equal(assertExecutionStatePort(port), port);
    assert.equal(Object.isFrozen(port), true);
    assert.equal(Object.hasOwn(port, 'db'), false);
    assert.equal(Object.hasOwn(port, 'transaction'), false);
    assert.equal(port.getExecutionBatch('batch-1').status, 'RUNNING');
    assert.equal(port.listExecutionBatchItems('batch-1').length, 1);
    assert.equal(port.getExecutionBatchItemForTask('task-1').batch_id, 'batch-1');
    assert.equal(port.getMandatoryBatchItemForTask('job-1', 'task-1').length, 1);
    assert.equal(port.hasTaskAttemptHistory('task-1'), true);
    assert.equal(port.hasTaskBatchItemHistory('task-1'), true);
    assert.equal(port.getResult('result-1').content, 'ok');
    assert.equal(port.hasSuccessfulTaskResult('result-1', 'task-1'), true);
    assert.equal(port.listSuccessfulResultsForTask('task-1').length, 1);
    assert.equal(port.listResultsForTask('task-1').length, 1);
    assert.equal(port.listActiveLocalAttemptsForTask('task-1').length, 1);
    assert.equal(port.countTaskAttempts('task-1'), 1);
    assert.equal(port.countTaskBatchItems('task-1'), 1);
    assert.equal(port.getAttempt('attempt-1', 'task-1').status, 'started');
    assert.equal(port.listActiveExecutionBatchesForJob('job-1').length, 1);
    assert.equal(port.getLatestTaskResult('task-1').content, 'ok');
    assert.equal(port.getLatestTaskCheckpoint('task-1').checkpoint_id, 'checkpoint-1');
    assert.equal(port.listAttemptsForTaskIds(['task-1']).length, 1);
    assert.equal(port.listAttemptsForTaskIds([]).length, 0);
    assert.equal(port.listResultsForTaskIds(['task-1'])[0].durable_rowid > 0, true);
    assert.equal(port.listResultsForTaskIds([]).length, 0);
    const attemptCounts = port.listAttemptStatusCounts();
    assert.equal(attemptCounts.length, 1);
    assert.equal(attemptCounts[0].status, 'started');
    assert.equal(attemptCounts[0].count, 2);
    assert.equal(stateStore.updateResultContent({ resultId: 'result-1', content: 'updated' }).changes, 1);
    assert.equal(port.getResult('result-1').content, 'updated');

    const workflowStoreShape = { db, getExecutionStatePort: () => port };
    const workflowState = createWorkflowStatePort(workflowStoreShape, {
      executionPersistenceStore: new ExecutionPersistenceStore(db)
    });
    assert.equal(workflowState.getExecutionBatch('batch-1').status, 'RUNNING');
    assert.equal(workflowState.listExecutionBatchItems('batch-1').length, 1);
    assert.equal(workflowState.getAttempt('attempt-1', 'task-1').status, 'started');
    assert.equal(workflowState.getResult('result-1').content, 'updated');
  } finally {
    db.close();
  }
}

{
  const db = new DatabaseSync(':memory:');
  try {
    createWorkflowParents(db);
    db.exec(`
      CREATE TABLE execution_batches (
        batch_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(job_id),
        parent_task_id TEXT REFERENCES tasks(task_id),
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT NOT NULL
      );
      CREATE TABLE execution_batch_items (
        batch_id TEXT NOT NULL REFERENCES execution_batches(batch_id),
        item_id TEXT NOT NULL,
        task_id TEXT NOT NULL REFERENCES tasks(task_id),
        command TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (batch_id, item_id)
      );
    `);
    new ExecutionStateStore(db);
    const columns = new Set(db.prepare('PRAGMA table_info(execution_batch_items)').all().map(row => row.name));
    for (const column of ['attempt', 'cwd', 'timeout_ms']) assert.ok(columns.has(column), `migration omitted ${column}`);
  } finally {
    db.close();
  }
}

{
  let execCalls = 0;
  const fake = { __p6Fake: true, prepare() { return {}; }, exec() { execCalls++; } };
  assert.doesNotThrow(() => new ExecutionStateStore(fake));
  assert.equal(execCalls, 0, 'fake DB must not receive schema DDL');
}

{
  const source = fs.readFileSync(path.join(root, 'src/runtime/job-store.js'), 'utf8');
  assert.match(source, /import \{[\s\S]*ExecutionStateStore[\s\S]*\} from '@runalith\/execution-runtime'/);
  assert.match(source, /new ExecutionStateStore\(this\.db\)/);
  assert.doesNotMatch(source,
    /CREATE TABLE IF NOT EXISTS (?:attempts|results|execution_batches|execution_batch_items|task_checkpoints)\b/,
    'WorkflowStore must not retain physical DDL for ExecutionStateStore-owned tables');
  assert.doesNotMatch(source, /ALTER TABLE execution_batch_items ADD COLUMN/,
    'Execution batch schema migrations must remain with ExecutionStateStore');
  assert.doesNotMatch(source, /(?:INSERT(?: OR [A-Z]+)? INTO)\s+(?:attempts|results|task_checkpoints)\b/i,
    'Execution-owned attempt/result/checkpoint inserts must go through ExecutionStateStore');
  assert.doesNotMatch(source, /UPDATE\s+results\s+SET\b/i,
    'Execution-owned result content updates must go through ExecutionStateStore');
  assert.doesNotMatch(source, /UPDATE\s+attempts\s+SET\b/i,
    'Execution-owned attempt status and run-ID mutations must go through ExecutionStateStore');
  assert.doesNotMatch(source,
    /this\.#executionStateStore\.(?:insertAttempt|insertResult|insertTaskCheckpoint|updateResultContent|updateAttemptStatusByIdentity|updateActiveAttemptsForTask|updateAttemptStatusBefore|bindAttemptRunIdIfUnbound|bindStartedAttemptRunId|setAttemptRunId|insertExecutionBatch|insertExecutionBatchItem|reserveExecutionBatchForRetry|reserveExecutionBatchForAttempt|reserveExecutionBatchForCancellation|retryExecutionBatch|resetIncompleteExecutionBatchItemsForRetry|finishExecutionBatchItem|failRunningExecutionBatchItem|markExecutionBatchWaiting|finishExecutionBatch|cancelIncompleteExecutionBatchItems|cancelExecutionBatch)\(/,
    'WorkflowStore must use the internal ExecutionStateParticipant for Execution writes');
  assert.match(source, /createExecutionStateParticipant\(this\.#executionStateStore\)/,
    'WorkflowStore must compose the internal versioned ExecutionStateParticipant');
  assert.doesNotMatch(source, /INSERT INTO execution_batches\b|INSERT INTO execution_batch_items\b/i,
    'Execution-owned batch/item inserts must go through ExecutionStateStore');
  assert.doesNotMatch(source, /UPDATE execution_batches SET status='RUNNING'|UPDATE execution_batches SET status='WAITING'|UPDATE execution_batches SET status=\?, finished_at=\?, aggregate_content=\?|UPDATE execution_batches SET status='CANCELLED'/i,
    'pure execution-batch state mutations must go through ExecutionStateStore');
  assert.doesNotMatch(source, /UPDATE execution_batch_items SET status='PENDING'|UPDATE execution_batch_items SET status=\?, execution_session_id=\?|UPDATE execution_batch_items SET status='CANCELLED'/i,
    'pure execution-batch-item state mutations must go through ExecutionStateStore');
  const remainingBatchDml = [...source.matchAll(/(?:INSERT INTO|UPDATE)\s+(execution_batches|execution_batch_items)\b/g)]
    .map(([, table]) => table);
  assert.deepEqual(remainingBatchDml, [],
    'WorkflowStore must route all Execution batch/item DML through ExecutionStateParticipant');
  assert.match(source, /reserveExecutionBatchForAttempt\([\s\S]*?const job = this\.db\.prepare\(`SELECT j\.status,j\.state FROM execution_batches b[\s\S]*?JOIN jobs j ON j\.job_id=b\.job_id/,
    'batch claim must reserve the Execution batch row before checking parent Job state in the same transaction');
  assert.match(source, /reserveExecutionBatchForAttempt\([\s\S]*?const task = this\.getTask\(item\.task_id\)[\s\S]*?const startedAttempts = Number\(this\.db\.prepare\("SELECT COUNT\(\*\) AS n FROM attempts WHERE task_id=\? AND status='started'"\)/,
    'unstarted recovery must reserve batch row before rechecking Workflow task and attempt state');
  assert.match(source, /this\.#executionStateStore\.getLatestTaskCheckpoint\(taskId\)/,
    'WorkflowStore checkpoint reads must delegate to ExecutionStateStore');
  assert.match(source, /this\.#executionStateStore\.listAttemptsForTaskIds\(taskIds\)/,
    'WorkflowStore job trace attempt reads must delegate to ExecutionStateStore');
  assert.match(source, /this\.#executionStateStore\.listResultsForTaskIds\(taskIds\)/,
    'WorkflowStore job trace result reads must delegate to ExecutionStateStore');
  assert.match(source, /this\.#executionStateStore\.listAttemptStatusCounts\(\)/,
    'WorkflowStore attempt observability reads must delegate to ExecutionStateStore');
  const portSource = fs.readFileSync(path.join(root, 'src/runtime/workflow-state-port.js'), 'utf8');
  assert.doesNotMatch(portSource,
    /(?:FROM|JOIN)\s+(?:attempts|results|execution_batches|execution_batch_items|task_checkpoints)\b(?![^`]*\b(?:tasks|jobs|events)\b)/i,
    'pure Execution-owned reads must be delegated to ExecutionStatePort; cross-domain joins remain Workflow-owned');
}

console.log('ExecutionStateStore schema ownership, migrations and same-connection checks passed');
