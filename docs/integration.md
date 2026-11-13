# Database integration

## Choose the connection model

Use one of these two models:

1. **Runtime-opened file database:** call openWorkflowDatabase(). The runtime resolves the path, validates directory/file identity, opens SQLite, and initializes the schema.
2. **Host-injected connection:** create a SQLite-compatible connection and pass it to createRunalithWorkflowStore(database). The host owns the connection, its filesystem configuration, and its lifetime.

Do not create one connection for Workflow and another for Agent Session or Execution persistence. The composed runtime requires one exact SQLite connection so cross-domain state changes can share a transaction.

## Runtime-opened database

~~~js
import {
  openWorkflowDatabase,
  createRunalithWorkflowStore,
} from '@runalith/workflow-runtime';

const opened = openWorkflowDatabase({
  environment: {
    ...process.env,
    WORKFLOW_DB: '/var/lib/my-service/workflow/workflow.db',
  },
});

const runtime = createRunalithWorkflowStore(opened.database);

try {
  // Use runtime APIs.
  console.log(runtime.getStats());
} finally {
  opened.database.close();
}
~~~

openWorkflowDatabase() returns { database, dbPath }. It does not run a background worker. The caller must keep the connection open while the runtime is in use and close it during orderly shutdown.

## Host-injected database

~~~js
import { DatabaseSync } from 'node:sqlite';
import { createRunalithWorkflowStore } from '@runalith/workflow-runtime';

const database = new DatabaseSync('/absolute/path/owned-by-host/workflow.db');
const runtime = createRunalithWorkflowStore(database);

try {
  // Workflow, Execution persistence, and Agent Session share database.
} finally {
  database.close();
}
~~~

initializeWorkflowDatabase(database) is also exported for hosts that want to initialize the Workflow schema before constructing a store. The connection must provide SQLite-compatible exec() and prepare() methods. The runtime configures WAL, foreign keys, busy timeout, and schema/migrations; it does not take ownership of closing an injected connection.

When a host injects a connection, the host is responsible for secure database path selection, directory/file ownership and permissions, backup, restore, and any connection-level settings not established by the runtime.

## Path configuration

resolveWorkflowDbPath({ environment }) follows this precedence:

1. WORKFLOW_DB, when non-empty, is resolved as the database file path.
2. Otherwise, WORKFLOW_DATA_DIR is used as the database directory with workflow.db as filename.
3. Otherwise, the path defaults to <process.cwd()>/data/workflow.db.

A relative configured path is resolved against the process working directory. Prefer an explicit absolute WORKFLOW_DB path in deployed hosts.

## Filesystem checks

On POSIX systems, the runtime-opened database path is constrained:

- Existing path components must be canonical real directories, not symlinks.
- Writable ancestors are rejected unless they use sticky-directory semantics.
- The final database directory must be owned by the runtime UID, mode 0700, and not group/world accessible.
- The database file must be a canonical regular file owned by the runtime UID with one hard link.
- Database file permissions are secured to 0600, then file identity and permissions are read back.
- The path is checked again after the SQLite connection opens.

These checks reduce path substitution and unintended disclosure risk. They do not protect a database from a compromised process running as the same UID, malicious host administrators, unsafe backups, or every possible filesystem race.

## Schema and migrations

initializeWorkflowDatabase() creates Workflow-owned tables and applies supported additive migrations. Composed stores initialize their additional Execution and Agent Session schemas against the same connection.

Before upgrading a durable database:

1. Stop writers and take a consistent SQLite backup using a procedure suitable for WAL mode.
2. Test the upgrade against a copy of the actual schema and representative data.
3. Keep the previous package version and backup available until post-upgrade checks pass.
4. Do not point this package at a database owned by an unrelated application.

The package does not provide a cross-service migration coordinator or a distributed schema-version registry. Migration compatibility remains pre-1.0.

## Connection and transaction ownership

- The host owns connection lifetime and shutdown.
- Workflow owns transactions that span workflow, execution, provider, and session state.
- Execution participants accept typed arguments, not caller SQL or a transaction callback.
- A participant must be composed with the same connection used by Workflow.
- Do not perform slow network or provider operations while holding a SQLite writer transaction. Persist intent, commit, perform the external operation in the host, then record the observed result through the runtime's intended API.

## Import and legacy singleton behavior

Importing @runalith/workflow-runtime is side-effect-free with respect to the database filesystem. The legacy workflowStore proxy is different: reading a property or invoking a method resolves the default store and opens the default database. Prefer explicit composition in new integrations.

WORKFLOW_DB_PATH is a path value resolved when the module loads. Set environment variables before importing the package when relying on the legacy singleton.
