# Custom role contract

The public custom-role-contract subpath exports pure role-definition validation only:

- CUSTOM_ROLE_ARTIFACT_TYPES, CUSTOM_ROLE_CAPABILITIES, CUSTOM_ROLE_PERMISSIONS, CUSTOM_ROLE_ALLOWED_TOOLS
- normalizeCustomRoleDefinition(input, { partial, base, skillsSnapshot })
- customRoleSchema()
- customRoleFingerprint(role)

The host must call Agent Runtime loadAgentSkills for supplied local directories or public GitHub URLs, then pass the immutable returned skill DTO array as skillsSnapshot. On a partial update without a skills field, the existing skill snapshot is retained; an explicit empty snapshot clears skills.

The pure package validates role IDs, field bounds, input/output artifacts, capability declarations, closed permission/tool allowlists, mandatory artifact.create permission and skill snapshot count. Capability, permission and tool declarations remain descriptive contracts; they do not assign roles, grant runtime execution, authorize tools or perform workspace writes.

The API has no filesystem, network, DB, version history, role lookup, approval, execution or dispatch behavior. Host custom-roles.js retains Agent Runtime skill ingestion and SQLite immutable version writes/reads.
