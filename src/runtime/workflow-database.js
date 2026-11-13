import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function canonicalizeWorkflowDatabaseDirectory(directory) {
  // Resolve the nearest existing parent before rebasing missing path segments.
  // This preserves canonical paths on systems with aliases such as /var -> /private/var.
  const absolute = path.resolve(directory);
  let existing = absolute;
  while (true) {
    try {
      const info = fs.statSync(existing);
      if (!info.isDirectory()) throw new Error(`workflow database parent prefix is not a directory: ${existing}`);
      const canonicalExisting = fs.realpathSync(existing);
      return path.resolve(canonicalExisting, path.relative(existing, absolute));
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw new Error(`cannot resolve workflow database parent path: ${absolute}`);
      existing = parent;
    }
  }
}

export function resolveWorkflowDbPath({ environment = process.env } = {}) {
  const dataDir = environment.WORKFLOW_DATA_DIR || path.join(process.cwd(), 'data');
  const configuredPath = path.resolve(environment.WORKFLOW_DB || path.join(dataDir, 'workflow.db'));
  return path.join(canonicalizeWorkflowDatabaseDirectory(path.dirname(configuredPath)), path.basename(configuredPath));
}

const initializedWorkflowDatabases = new WeakSet();

/** Initialize Workflow-owned schema on an explicitly supplied SQLite connection. */
export function initializeWorkflowDatabase(database) {
  if (!database || typeof database !== 'object' || typeof database.exec !== 'function' ||
      typeof database.prepare !== 'function') {
    throw new TypeError('initializeWorkflowDatabase requires a SQLite-compatible database connection');
  }
  if (initializedWorkflowDatabases.has(database)) return database;
  const db = database;
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    job_id TEXT PRIMARY KEY, conversation_key TEXT NOT NULL, title TEXT NOT NULL,
    state TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('active','completed','failed','cancelled')),
    active_task_id TEXT, provider_waiting INTEGER NOT NULL DEFAULT 0, provider_retry_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, approved_at TEXT, completed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_conversation_active ON jobs(conversation_key, status, updated_at DESC);
  CREATE TABLE IF NOT EXISTS tasks (
    task_id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(job_id), role TEXT NOT NULL,
    description TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','cancelled')),
    openclaw_run_id TEXT, openclaw_session_key TEXT, parent_task_id TEXT, dependency_json TEXT NOT NULL DEFAULT '[]', metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_job ON tasks(job_id, created_at);
  CREATE TABLE IF NOT EXISTS approvals (
    approval_id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(job_id),
    decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')), actor TEXT NOT NULL, raw_text TEXT NOT NULL,
    proposal_hash TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS artifacts (
    artifact_id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(job_id), task_id TEXT,
    kind TEXT NOT NULL, uri TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reports (
    report_id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(job_id), kind TEXT NOT NULL,
    content TEXT NOT NULL, delivered_at TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(job_id), type TEXT NOT NULL,
    payload_json TEXT NOT NULL, created_at TEXT NOT NULL
  );
  -- Maker/checker nonces and approval-policy high-water observations are
  -- security-critical replay/rollback state. Keep these event records append-only
  -- at the SQLite row boundary; an external monotonic checkpoint is still
  -- required to detect whole-database restore or trigger/schema replacement.
  -- SQLite REPLACE may delete a conflicting row without firing DELETE triggers
  -- when recursive_triggers is disabled. Ignore any attempted insertion that
  -- reuses a security-event ID before REPLACE conflict handling can run.
  CREATE TRIGGER IF NOT EXISTS agg_approval_security_events_no_replace
    BEFORE INSERT ON events
    WHEN EXISTS (
      SELECT 1 FROM events existing
      WHERE existing.event_id=NEW.event_id
        AND existing.type IN ('approval.approved', 'adaptive_goal.approval_policy_version_observed')
    )
    BEGIN SELECT RAISE(IGNORE); END;
  CREATE TRIGGER IF NOT EXISTS agg_approval_security_events_no_update
    BEFORE UPDATE ON events
    WHEN OLD.type IN ('approval.approved', 'adaptive_goal.approval_policy_version_observed')
    BEGIN SELECT RAISE(ABORT, 'AGG approval security events are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS agg_approval_security_events_no_delete
    BEFORE DELETE ON events
    WHEN OLD.type IN ('approval.approved', 'adaptive_goal.approval_policy_version_observed')
    BEGIN SELECT RAISE(ABORT, 'AGG approval security events are append-only'); END;
  -- Provider-signed reviewer nonces are also anti-replay state. Use additive v2
  -- trigger names so existing databases that already have the earlier approval-
  -- only triggers receive the expanded protection without requiring a destructive
  -- trigger replacement or migration.
  CREATE TRIGGER IF NOT EXISTS agg_approval_reviewer_security_events_no_replace
    BEFORE INSERT ON events
    WHEN EXISTS (
      SELECT 1 FROM events existing
      WHERE existing.event_id=NEW.event_id
        AND existing.type IN ('approval.approved', 'adaptive_goal.approval_policy_version_observed', 'adaptive_goal.action_intent_review_authorized')
    )
    BEGIN SELECT RAISE(IGNORE); END;
  CREATE TRIGGER IF NOT EXISTS agg_approval_reviewer_security_events_no_update
    BEFORE UPDATE ON events
    WHEN OLD.type IN ('approval.approved', 'adaptive_goal.approval_policy_version_observed', 'adaptive_goal.action_intent_review_authorized')
    BEGIN SELECT RAISE(ABORT, 'AGG approval security events are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS agg_approval_reviewer_security_events_no_delete
    BEFORE DELETE ON events
    WHEN OLD.type IN ('approval.approved', 'adaptive_goal.approval_policy_version_observed', 'adaptive_goal.action_intent_review_authorized')
    BEGIN SELECT RAISE(ABORT, 'AGG approval security events are append-only'); END;
  CREATE INDEX IF NOT EXISTS idx_events_job ON events(job_id, created_at);
  CREATE TABLE IF NOT EXISTS workflow_events (
    workflow_event_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(job_id),
    from_phase TEXT,
    to_phase TEXT NOT NULL,
    event TEXT NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_workflow_events_job ON workflow_events(job_id, created_at);
  CREATE TABLE IF NOT EXISTS slack_threads (
    job_id TEXT PRIMARY KEY REFERENCES jobs(job_id), channel TEXT NOT NULL, target TEXT NOT NULL,
    root_message_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS slack_projections (
    event_id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(job_id),
    channel TEXT NOT NULL, target TEXT NOT NULL, message_id TEXT, projected_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS slack_projection_uncertain (
    event_id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(job_id),
    channel TEXT NOT NULL, target TEXT NOT NULL, error TEXT NOT NULL, marked_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS slack_job_views (
    job_id TEXT PRIMARY KEY REFERENCES jobs(job_id),
    state TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_waiting INTEGER NOT NULL DEFAULT 0,
    provider_retry_at TEXT,
    task_total INTEGER NOT NULL DEFAULT 0,
    task_pending INTEGER NOT NULL DEFAULT 0,
    task_running INTEGER NOT NULL DEFAULT 0,
    task_completed INTEGER NOT NULL DEFAULT 0,
    task_failed INTEGER NOT NULL DEFAULT 0,
    last_event_type TEXT,
    last_event_id TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workflow_runtime_state (
    job_id TEXT PRIMARY KEY REFERENCES jobs(job_id),
    phase TEXT NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 0,
    resume_after TEXT,
    last_error TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS task_leases (
    lease_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(task_id),
    job_id TEXT NOT NULL REFERENCES jobs(job_id),
    attempt INTEGER NOT NULL,
    worker_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('ACTIVE','EXPIRED','RELEASED','COMPLETED','FAILED')),
    issued_at TEXT NOT NULL,
    heartbeat_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    released_at TEXT,
    last_error TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_task_leases_active_task ON task_leases(task_id) WHERE state='ACTIVE';
  CREATE INDEX IF NOT EXISTS idx_task_leases_expiry ON task_leases(state, expires_at);
  CREATE INDEX IF NOT EXISTS idx_task_leases_worker ON task_leases(worker_id, state);
  CREATE TABLE IF NOT EXISTS workflow_plans (
    job_id TEXT PRIMARY KEY REFERENCES jobs(job_id),
    workflow_id TEXT NOT NULL,
    workflow_version INTEGER NOT NULL,
    plan_hash TEXT NOT NULL,
    plan_json TEXT NOT NULL,
    compiled_at TEXT NOT NULL,
    approved_at TEXT
  );
  `);

  for (const sql of [
    "ALTER TABLE artifacts ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE artifacts ADD COLUMN producer_role TEXT",
    "ALTER TABLE artifacts ADD COLUMN content TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE artifacts ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE artifacts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
    "ALTER TABLE artifacts ADD COLUMN supersedes TEXT",
    "ALTER TABLE artifacts ADD COLUMN content_hash TEXT"
  ]) {
    try { db.exec(sql); } catch (err) {
      if (!String(err?.message || err).toLowerCase().includes('duplicate column')) throw err;
    }
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_artifacts_job_created ON artifacts(job_id, created_at); CREATE INDEX IF NOT EXISTS idx_artifacts_task_created ON artifacts(task_id, created_at); CREATE INDEX IF NOT EXISTS idx_artifacts_type_status ON artifacts(kind, status, created_at);');

  try { db.exec('ALTER TABLE approvals ADD COLUMN proposal_hash TEXT'); } catch (_) {}
  db.exec('CREATE INDEX IF NOT EXISTS idx_approvals_job_created ON approvals(job_id, created_at DESC);');

  for (const sql of [
    "ALTER TABLE jobs ADD COLUMN provider_waiting INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE jobs ADD COLUMN provider_retry_at TEXT"
  ]) {
    try { db.exec(sql); } catch (err) {
      if (!String(err?.message || err).toLowerCase().includes('duplicate column')) throw err;
    }
  }

  db.exec(`
  CREATE TABLE IF NOT EXISTS m12_native_specialist_runtime (
    task_id TEXT NOT NULL REFERENCES tasks(task_id),
    attempt INTEGER NOT NULL,
    session_key TEXT NOT NULL,
    native_session_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    environment_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    lease_id TEXT NOT NULL,
    owner_epoch INTEGER NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('ACTIVE','COMPLETED','FAILED','STALE')),
    result_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (task_id, attempt),
    UNIQUE (native_session_id),
    UNIQUE (run_id)
  );
  CREATE INDEX IF NOT EXISTS idx_m12_native_runtime_run ON m12_native_specialist_runtime(run_id);
  CREATE INDEX IF NOT EXISTS idx_m12_native_runtime_lease ON m12_native_specialist_runtime(lease_id);
  `);

  // Forward-compatible migrations for databases created by earlier phases.
  for (const sql of [
    "ALTER TABLE tasks ADD COLUMN parent_task_id TEXT",
    "ALTER TABLE tasks ADD COLUMN dependency_json TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE tasks ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE tasks ADD COLUMN execution_session_id TEXT",
    "ALTER TABLE tasks ADD COLUMN execution_status TEXT",
    "ALTER TABLE tasks ADD COLUMN execution_attempt INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE tasks ADD COLUMN execution_pid INTEGER",
    "ALTER TABLE tasks ADD COLUMN execution_exit_code INTEGER",
    "ALTER TABLE tasks ADD COLUMN execution_started_at TEXT",
    "ALTER TABLE tasks ADD COLUMN execution_finished_at TEXT",
    "ALTER TABLE tasks ADD COLUMN execution_stdout TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE tasks ADD COLUMN execution_stderr TEXT NOT NULL DEFAULT ''"
  ]) {
    try { db.exec(sql); } catch (err) {
      if (!String(err?.message || err).toLowerCase().includes('duplicate column')) throw err;
    }
  }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_runtime ON tasks(openclaw_run_id, openclaw_session_key)'); } catch (_) {}
  // Owner epochs fence stale workers across lease recovery and reacquisition.
  // Existing rows remain historical; a caller still needs an exact live proof.
  try { db.exec('ALTER TABLE task_leases ADD COLUMN owner_epoch INTEGER NOT NULL DEFAULT 1'); } catch (err) {
    if (!String(err?.message || err).toLowerCase().includes('duplicate column')) throw err;
  }
  initializedWorkflowDatabases.add(database);
  return database;
}

/** Open and initialize the host SQLite database. Called only by explicit host composition. */
export function openWorkflowDatabase({ environment = process.env } = {}) {
  const configuredDbPath = resolveWorkflowDbPath({ environment });

  function assertWorkflowDatabaseDirectory(directory, { allowMissing = false } = {}) {
    const absolute = path.resolve(directory);
    const root = path.parse(absolute).root;
    let cursor = root;
    const components = absolute.slice(root.length).split(path.sep).filter(Boolean);
    let missingSeen = false;
    if (components.length === 0) {
      const info = fs.lstatSync(root);
      if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) {
        throw new Error(`workflow database directory is not private: ${root}`);
      }
    }
    for (let index = 0; index < components.length; index++) {
      cursor = path.join(cursor, components[index]);
      let entry;
      try { entry = fs.lstatSync(cursor); }
      catch (error) {
        if (allowMissing && error?.code === 'ENOENT') { missingSeen = true; continue; }
        throw new Error(`workflow database directory is missing or unreadable: ${cursor}: ${error?.message || error}`);
      }
      if (missingSeen) throw new Error(`workflow database directory path changed while being checked: ${cursor}`);
      if (!entry.isDirectory() || entry.isSymbolicLink() || fs.realpathSync(cursor) !== cursor) {
        throw new Error(`workflow database directory must use canonical real directories: ${cursor}`);
      }
      if (process.platform !== 'win32') {
        const isFinalDirectory = index === components.length - 1;
        const mode = entry.mode & 0o7777;
        if (isFinalDirectory) {
          if (typeof process.getuid === 'function' && entry.uid !== process.getuid()) {
            throw new Error(`workflow database directory is not owned by the runtime user: ${cursor}`);
          }
          if ((mode & 0o077) !== 0 || (mode & 0o700) !== 0o700) {
            throw new Error(`workflow database directory is not private: ${cursor} mode=0${(mode & 0o777).toString(8).padStart(3, '0')}; expected owner rwx and no group/world permissions`);
          }
        } else if ((mode & 0o022) !== 0 && (mode & 0o1000) === 0) {
          // Sticky shared directories such as /tmp protect child entries from
          // replacement by another UID. A writable non-sticky ancestor does not.
          throw new Error(`workflow database path has a replaceable writable ancestor: ${cursor}`);
        }
      }
    }
    if (!allowMissing && missingSeen) throw new Error(`workflow database directory is missing: ${absolute}`);
  }

  function secureWorkflowDatabaseFile(filePath) {
    let before;
    try { before = fs.lstatSync(filePath); }
    catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    if (!before.isFile() || before.isSymbolicLink() || fs.realpathSync(filePath) !== filePath) {
      throw new Error(`workflow database path must be a canonical regular file, not a symlink or special file: ${filePath}`);
    }
    if (typeof process.getuid === 'function' && before.uid !== process.getuid()) {
      throw new Error(`workflow database file is not owned by the runtime user: ${filePath}`);
    }
    if (before.nlink !== 1) throw new Error(`workflow database file has unexpected hard links: ${filePath}`);
    if (process.platform !== 'win32') {
      if ((before.mode & 0o077) !== 0) {
        try { fs.chmodSync(filePath, 0o600); }
        catch (error) { throw new Error(`workflow database file permissions cannot be secured: ${filePath}: ${error?.message || error}`); }
      }
      const after = fs.lstatSync(filePath);
      if (!after.isFile() || after.isSymbolicLink() || after.dev !== before.dev || after.ino !== before.ino ||
          after.nlink !== 1 || (after.mode & 0o077) !== 0 || fs.realpathSync(filePath) !== filePath) {
        throw new Error(`workflow database file identity or permissions changed while being secured: ${filePath}`);
      }
    }
  }

  // Keep SQLite itself behind a private, canonical directory even when callers
  // override WORKFLOW_DB. Securing only WORKFLOW_DATA_DIR is insufficient: an
  // override like /tmp/workflow.db creates a mode-0644 database under common
  // umasks, exposing durable prompts, approvals, artifacts and execution traces.
  // Validate existing ancestors before mkdir so a missing child is never created
  // below a group/world-writable non-sticky directory.
  const DB_PATH = configuredDbPath;
  const DB_DIRECTORY = path.dirname(DB_PATH);
  assertWorkflowDatabaseDirectory(DB_DIRECTORY, { allowMissing: true });
  fs.mkdirSync(DB_DIRECTORY, { recursive: true, mode: 0o700 });
  assertWorkflowDatabaseDirectory(DB_DIRECTORY);
  secureWorkflowDatabaseFile(DB_PATH);
  const db = new DatabaseSync(DB_PATH, { timeout: 5000, enableForeignKeyConstraints: true });
  try { secureWorkflowDatabaseFile(DB_PATH); }
  catch (error) { try { db.close(); } catch {} throw error; }

  try { initializeWorkflowDatabase(db); }
  catch (error) { try { db.close(); } catch {} throw error; }
  return { database: db, dbPath: DB_PATH };
}
