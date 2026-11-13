import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openWorkflowDatabase, resolveWorkflowDbPath } from '../src/runtime/workflow-database.js';
import { WorkflowStore, WORKFLOW_DB_PATH } from '../src/runtime/job-store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Importing either public entrypoint must not mkdir, open, migrate or chmod the host DB.
{
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-import-no-side-effect-'));
  const databasePath = path.join(temporaryRoot, 'not-created', 'workflow.db');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const publicApi = await import(${JSON.stringify(path.join(root, 'job-store.js'))});
    await import(${JSON.stringify(path.join(root, 'src/runtime/runalith-runtime-composition.js'))});
    const fs = await import('node:fs');
    if (fs.existsSync(${JSON.stringify(databasePath)})) process.exit(11);
    if (fs.existsSync(${JSON.stringify(path.dirname(databasePath))})) process.exit(12);
    const database = publicApi.workflowStore.db;
    if (!fs.existsSync(${JSON.stringify(databasePath)})) process.exit(13);
    database.close();
  `], {
    cwd: root,
    env: { ...process.env, WORKFLOW_DB: databasePath },
    encoding: 'utf8'
  });
  try {
    assert.equal(child.status, 0, `import subprocess failed: ${child.stderr || child.stdout}`);
    assert.equal(fs.existsSync(databasePath), true, 'singleton property access should initialize host DB lazily');
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

// Injected DatabaseSync is sufficient; constructor must not open WORKFLOW_DB.
{
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-injected-db-'));
  const unexpectedPath = path.join(temporaryRoot, 'host-not-created.db');
  const database = new DatabaseSync(':memory:');
  try {
    const store = new WorkflowStore(database);
    assert.equal(store.db, database);
    assert.equal(database.prepare('PRAGMA foreign_keys').get().foreign_keys, 1,
      'injected connections must retain Workflow foreign-key enforcement');
    assert.equal(database.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='jobs'").get()?.present, 1);
    assert.equal(fs.existsSync(unexpectedPath), false);
  } finally {
    database.close();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

// Explicit host open retains private-directory and schema guarantees.
{
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-open-db-'));
  const databaseDirectory = path.join(temporaryRoot, 'private-data');
  const databasePath = path.join(databaseDirectory, 'workflow.db');
  let database;
  try {
    const opened = openWorkflowDatabase({ environment: { WORKFLOW_DB: databasePath } });
    database = opened.database;
    new WorkflowStore(database);
    assert.equal(opened.dbPath, databasePath);
    assert.equal(resolveWorkflowDbPath({ environment: { WORKFLOW_DB: databasePath } }), databasePath);
    assert.equal(database.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='jobs'").get()?.present, 1);
    assert.equal(database.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='execution_batches'").get()?.present, 1);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(databaseDirectory).mode & 0o777, 0o700);
      assert.equal(fs.statSync(databasePath).mode & 0o077, 0);
    }
  } finally {
    try { database?.close(); } catch {}
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

assert.equal(typeof WORKFLOW_DB_PATH, 'string');
console.log('Workflow database composition: import is side-effect-free; injected DB and explicit secure host open PASS');
