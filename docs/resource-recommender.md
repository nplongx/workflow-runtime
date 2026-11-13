# Reusable resource recommendation API

\`@runalith/workflow-runtime/resource-recommender\` exposes a pure read-model API:

\`recommendReusableResourcesFromReadModels({ task, roles, workflows, policies, compatibleProfileOverlayRolesByRole }, { limit })\`.

The caller supplies detached latest-version role/workflow/policy snapshots. \`compatibleProfileOverlayRolesByRole\` is a host-computed map from custom role ID to the built-in role IDs that passed exact-version input/output contract checks. The package does not resolve custom roles from SQLite or infer overlay compatibility.

The implementation performs deterministic English/Vietnamese lexical expansion, scoring, ranking and recommendation DTO construction. It returns discovery hints only; it does not attach, edit, approve, authorize or dispatch resources.

The host owns all DB reads, exact-version role resolution, skills ingestion and policy attachment/approval semantics. The pure package has no DB or filesystem side effects.
