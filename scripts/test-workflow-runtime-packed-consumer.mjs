#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-runtime-packed-consumer-'));
const consumerRoot = path.join(temporaryRoot, 'consumer');
const environment = {
  ...process.env,
  npm_config_update_notifier: 'false',
  npm_config_fund: 'false',
  npm_config_audit: 'false'
};

function run(command, args, cwd, label, env = environment) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed (status=${result.status}, signal=${result.signal}):\n${result.stdout || ''}\n${result.stderr || ''}\n${result.error?.message || ''}`);
  }
  return result.stdout.trim();
}

try {
  fs.mkdirSync(consumerRoot, { mode: 0o700 });
  const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', temporaryRoot], root, 'npm pack'));
  assert.equal(packed.length, 1);
  assert.equal(packed[0].name, '@runalith/workflow-runtime');
  assert.equal(packed[0].version, '0.2.2');
  const tarball = path.join(temporaryRoot, packed[0].filename);
  assert.ok(fs.statSync(tarball).size > 10_000);

  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', consumerRoot, tarball], root,
    'install packed workflow-runtime into clean consumer');

  const databasePath = path.join(temporaryRoot, 'must-not-open-on-import', 'workflow.db');
  const smoke = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { DatabaseSync } from 'node:sqlite';
    const api = await import('@runalith/workflow-runtime');
    assert.equal(fs.existsSync(${JSON.stringify(databasePath)}), false, 'package import created host database');
    assert.equal(typeof api.createRunalithWorkflowStore, 'function');
    assert.equal(typeof api.createWorkflowStatePort, 'function');
    assert.equal(typeof api.createExecutionStatePort, 'function');
    assert.equal(typeof api.ExecutionStateStore, 'function');
    assert.equal(typeof api.ExecutionPersistenceStore, 'function');
    assert.equal(typeof api.configureProductionQaHarnessRoot, 'function');
    assert.equal(typeof api.configureCompiledActionIntentSemanticVerifier, 'function');
    assert.equal(api.WORKFLOW_PLAN_API_VERSION, 1);
    assert.equal(typeof api.workflowPlanApi.validateExecutionPlan, 'function');
    const planApi = await import('@runalith/workflow-runtime/workflow-plan');
    assert.equal(planApi.WORKFLOW_PLAN_API_VERSION, 1);
    assert.equal(typeof planApi.configureCompiledActionIntentSemanticVerifier, 'function');
    assert.equal(planApi.workflowPlanApi.canonicalJson({b:2,a:1}), '{\"a\":1,\"b\":2}');
    const database = new DatabaseSync(':memory:');
    try {
      const store = api.createRunalithWorkflowStore(database);
      assert.equal(store.db, database);
      assert.equal(store.agentSessions.version, 1);
      const job = store.createJob({ conversationKey: 'packed-consumer-smoke', title: 'Clean consumer' });
      assert.equal(store.getJob(job.job_id).job_id, job.job_id);
      assert.deepEqual(store.agentSessions.listActiveAgentSessionsForJob(job.job_id), []);
      assert.deepEqual(store.agentSessions.getSessionTraceForJob(job.job_id), { sessions: [], sessionMessages: [] });
      assert.equal(fs.existsSync(${JSON.stringify(databasePath)}), false, 'injected DB path unexpectedly opened');
    } finally { database.close(); }
    console.log('packed consumer API, injected SQLite, Agent Session composition and import side-effect PASS');
  `;
  run(process.execPath, ['--input-type=module', '-e', smoke], consumerRoot, 'packed consumer API smoke', {
    ...environment,
    WORKFLOW_DB: databasePath,
    WORKFLOW_DATA_DIR: path.dirname(databasePath)
  });
  console.log(`Workflow Runtime packed consumer PASS: ${packed[0].filename} (${packed[0].entryCount} package files, ${packed[0].size} bytes)`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
