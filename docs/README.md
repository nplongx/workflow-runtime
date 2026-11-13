# Documentation

| Topic | Document |
|---|---|
| Runtime responsibilities and module map | [Architecture](architecture.md) |
| Immutable phase identifiers and production phase ordering | [Workflow phases](phases.md) |
| Pure reviewer-artifact normalization and schema parsing | [Reviewer artifact normalization](reviewer-artifacts.md) |
| Pure Success Contract normalization and predicate evaluation | [Success Contracts](success-contracts.md) |
| Built-in Workflow roles and task capability vocabulary | [Workflow roles](roles.md) |
| Version-pinned custom role profiles and task overlays | [Role profiles](role-profiles.md) |
| Durable Workflow execution evidence contract | [Execution evidence](execution-evidence.md) |
| Scoped workspace-write plan contract | [Workspace-write contract](workspace-write-contract.md) |
| Compiled Agent Contract structural validation and host semantic-verifier injection | [Compiled Agent Contracts](agent-contracts.md) |
| Built-in Workflow definitions and task catalogs | [Workflow definitions and catalogs](workflow-definitions-and-catalogs.md) |
| Review recovery compatibility and Workflow tool errors | [Recovery and errors](recovery-and-errors.md) |
| SQLite opening, connection ownership, migrations | [Database integration](integration.md) |
| Workflow, execution, provider, and Agent Session terms | [Terminology](terminology.md) |
| Upstream source, pinned files, and extraction exclusions | [Source lineage](source-lineage.md) |
| Security assumptions and host-owned authority | [Security policy](../SECURITY.md) |
| Version and compatibility notes | [Changelog](../CHANGELOG.md) |

Recommended reading order: architecture, integration, terminology, then the security policy before connecting an approval verifier or persistent host database.

The root README is the installation and quick-start entrypoint. This package has no separate daemon or deployment manifest.

| Policy Contract API | [Policy Contract](policy-contract.md) |
