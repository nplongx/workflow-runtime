# Security Policy

Report vulnerabilities privately through GitHub Security Advisories for `nplongx/workflow-runtime`. Do not publish exploit details before maintainers assess impact.

The runtime handles workflow input, approvals, artifacts, execution metadata and session records. Treat SQLite database and workspace as sensitive. Keep database directories private, inject only trusted connections and keep owner-approval private keys outside this package.

Owner approval is fail-closed: the pure protocol module does not establish trust. Host must inject an independently configured verifier; no verifier means no protected approval. Production QA acceptance requires the exact pinned host harness.
