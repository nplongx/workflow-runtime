# Source lineage and extraction boundary

## Upstream origin

The package was extracted from the Runalith source repository:

- Source repository: https://github.com/nplongx/runalith
- Source branch: integration/runalith-system-20261107
- Base revision: 29c24cfa2b6ead5704d26cf2746bc384f2938b80
- Main extraction entrypoint: src/runtime/runalith-runtime-composition.js
- Additional entrypoints: src/runtime/workflow-control-port.js, src/runtime/execution-persistence-port.js, and src/runtime/execution-contract.js

The upstream working tree was dirty when extraction occurred, and its patch was not committed to the referenced base revision. Therefore the base revision alone does not identify all extracted bytes. docs/source-manifest.json records SHA-256 and byte size for 52 pinned source/package entries. Run npm run check:manifest to verify those bytes.

## Included source

The extraction contains the relative import closure for the runtime composition plus explicit support modules. Major source areas:

- Workflow store, SQLite database composition, schema initialization and migrations.
- Workflow definitions, catalogs, role contracts, compiler, policies, success contracts, artifact/evidence handling.
- Workflow, Execution state, Execution persistence, and Agent Session APIs/stores/participants.
- Strict JSON parsing, filesystem checks, observability helpers, provider-dispatch identity, owner-approval contract.
- Versioned COS-AP v1 source mirror under protocol/cos-ap-v1/.

The package owns its package.json, public entrypoint, lockfile, CI workflow, tests, scripts, documentation, and Git release history.

## Excluded source and dependencies

The package intentionally excludes the parent application's server/MCP adapters, host deployment configuration, unrelated subsystems, workspace state, credentials, and production behavioral QA harness files. Production QA integration must receive a trusted host root and validate the harness against the pinned digest.

No Git submodule, sibling-repository dependency, parent workspace path dependency, or runtime fetch from the source repository is required. The COS-AP v1 mirror is local package source, not a runtime dependency on the parent repository.

## Independence claims and limits

The repository can be installed from GitHub and its package can be consumed without checking out the source monorepo. CI checks Node.js 22 and 24, verifies pinned source hashes, runs focused tests, packs the package, and exercises a clean packed consumer.

This extraction establishes package/build independence. It does not establish deployment independence: Workflow, Execution persistence, and Agent Session are deliberately composed into one process and one SQLite connection. It also does not establish independent service boundaries, distributed transactions, production authorization, or production security certification.
