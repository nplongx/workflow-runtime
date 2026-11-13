import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  createRunalithWorkflowStore,
  RunalithWorkflowStore
} from '../src/runtime/runalith-runtime-composition.js';
import { AGENT_SESSION_API_VERSION } from '../src/runtime/agent-session-api.js';

const database = new DatabaseSync(':memory:');
try {
  const store = createRunalithWorkflowStore(database);
  assert.equal(store instanceof RunalithWorkflowStore, true);
  assert.equal(store.db, database, 'all host components must share the injected connection');
  assert.equal(store.agentSessions.version, AGENT_SESSION_API_VERSION);
  assert.equal(Object.isFrozen(store.agentSessions), true);

  const job = store.createJob({ conversationKey: 'workflow-runtime-composition-test', title: 'Composition smoke' });
  assert.equal(store.getJob(job.job_id).job_id, job.job_id);
  assert.deepEqual(store.agentSessions.listActiveAgentSessionsForJob(job.job_id), []);
  assert.deepEqual(store.agentSessions.getSessionTraceForJob(job.job_id), { sessions: [], sessionMessages: [] });
  const task = store.ensureTask(job.job_id, { role: 'architect', description: 'Agent Session composition smoke' });
  const session = store.agentSessions.createAgentSession(task.task_id, {
    sessionKey: 'agent:workflow-runtime-composition-test', role: 'architect'
  });
  assert.equal(session.task_id, task.task_id);
  assert.equal(store.agentSessions.getSession(session.session_id).openclaw_session_key,
    'agent:workflow-runtime-composition-test');
  assert.equal(store.agentSessions.listActiveAgentSessionsForJob(job.job_id).length, 1);
  assert.equal(store.db.prepare("SELECT type FROM events WHERE type='session.created'").get()?.type,
    'session.created');

  const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  for (const table of ['jobs', 'tasks', 'events', 'attempts', 'execution_batches', 'provider_runs',
    'provider_dispatch_intents', 'agent_sessions', 'session_access', 'session_messages']) {
    assert.ok(tables.has(table), `missing composed table ${table}`);
  }
  console.log('RunalithWorkflowStore composition, Agent Session API and single injected SQLite connection PASS');
} finally {
  database.close();
}
