// Pure custom-role definition contract. Skill ingestion and immutable role
// version persistence remain owned by the host and Agent Runtime.
import crypto from 'node:crypto';

export const CUSTOM_ROLE_ARTIFACT_TYPES = Object.freeze([
  'requirements', 'research', 'architecture', 'implementation', 'security-review',
  'qa-report', 'platform-review', 'documentation', 'review', 'cto-decision'
]);
export const CUSTOM_ROLE_CAPABILITIES = Object.freeze([
  'product.requirements', 'research.collect', 'architecture.design', 'code.modify',
  'security.audit', 'code.verify', 'infrastructure.verify', 'documentation.write',
  'change.review', 'synthesis.approve'
]);
export const CUSTOM_ROLE_PERMISSIONS = Object.freeze(['workspace.read', 'artifact.create']);
export const CUSTOM_ROLE_ALLOWED_TOOLS = Object.freeze([
  'workflow_catalog', 'workflow_list', 'workflow_get', 'workflow_events',
  'workflow_artifacts', 'workflow_validate_artifact'
]);

const MAX_PROMPT = 12000;
const MAX_DESCRIPTION = 2000;
const MAX_LIST = 32;
const MAX_SKILLS_PER_ROLE = 8;

function nonEmpty(value, field, max) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(field + ' must be a non-empty string');
  const result = value.trim();
  if (result.length > max) throw new Error(field + ' exceeds ' + max + ' characters');
  return result;
}

function slug(value) {
  const id = nonEmpty(value, 'role_id', 80).toLowerCase();
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) throw new Error('role_id must be a lowercase slug (letters, numbers, hyphens)');
  if (['cto', 'engineer', 'architect', 'qa', 'reviewer', 'security', 'platform', 'writer', 'researcher', 'product-owner'].includes(id) || id.startsWith('system-')) {
    throw new Error('role_id is reserved for a built-in role or system namespace: ' + id);
  }
  return id;
}

function stringList(value, field, allowed, { required = false } = {}) {
  if (!Array.isArray(value)) throw new Error(field + ' must be an array');
  if (value.length > MAX_LIST) throw new Error(field + ' may contain at most ' + MAX_LIST + ' entries');
  const items = value.map((item, index) => nonEmpty(item, field + '[' + index + ']', 200));
  if (new Set(items).size !== items.length) throw new Error(field + ' must not contain duplicates');
  if (required && items.length === 0) throw new Error(field + ' must contain at least one entry');
  if (allowed) {
    const invalid = items.filter(item => !allowed.includes(item));
    if (invalid.length) throw new Error(field + ' contains unsupported value(s): ' + invalid.join(', '));
  }
  return items;
}

export function normalizeCustomRoleDefinition(input, { partial = false, base = null, skillsSnapshot = undefined } = {}) {
  const source = { ...(base || {}), ...(input || {}) };
  const pickString = (field, max) => {
    if (partial && !Object.hasOwn(input || {}, field) && base) return base[field];
    return nonEmpty(source[field], field, max);
  };
  const inputContract = partial && !Object.hasOwn(input || {}, 'input_contract') && base
    ? base.input_contract
    : stringList(source.input_contract, 'input_contract', ['job.request', ...CUSTOM_ROLE_ARTIFACT_TYPES]);
  const allowedCapabilities = partial && !Object.hasOwn(input || {}, 'allowed_capabilities') && base
    ? base.allowed_capabilities
    : stringList(source.allowed_capabilities ?? [], 'allowed_capabilities', CUSTOM_ROLE_CAPABILITIES);
  const permissions = partial && !Object.hasOwn(input || {}, 'permissions') && base
    ? base.permissions
    : stringList(source.permissions ?? ['workspace.read', 'artifact.create'], 'permissions', CUSTOM_ROLE_PERMISSIONS, { required: true });
  const allowedTools = partial && !Object.hasOwn(input || {}, 'allowed_tools') && base
    ? base.allowed_tools
    : stringList(source.allowed_tools ?? [], 'allowed_tools', CUSTOM_ROLE_ALLOWED_TOOLS);
  const skills = partial && !Object.hasOwn(input || {}, 'skills') && base ? base.skills : skillsSnapshot;
  if (!Array.isArray(skills)) throw new Error('skillsSnapshot must be supplied as a host-resolved array');
  if (skills.length > MAX_SKILLS_PER_ROLE) throw new Error('skills may contain at most ' + MAX_SKILLS_PER_ROLE + ' entries per role');
  if (!inputContract.length) throw new Error('input_contract must contain at least one entry');
  if (!CUSTOM_ROLE_ARTIFACT_TYPES.includes(source.output_artifact_type)) {
    throw new Error('output_artifact_type must be one of: ' + CUSTOM_ROLE_ARTIFACT_TYPES.join(', '));
  }
  if (!permissions.includes('artifact.create')) throw new Error('permissions must include artifact.create');
  return {
    role_id: slug(source.role_id),
    name: pickString('name', 120),
    description: pickString('description', MAX_DESCRIPTION),
    system_prompt: pickString('system_prompt', MAX_PROMPT),
    input_contract: inputContract,
    output_artifact_type: source.output_artifact_type,
    allowed_capabilities: allowedCapabilities,
    permissions,
    allowed_tools: allowedTools,
    skills
  };
}

export function customRoleSchema() {
  return {
    role_id: { type: 'string', pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$', maxLength: 80 },
    name: { type: 'string', minLength: 1, maxLength: 120 },
    description: { type: 'string', minLength: 1, maxLength: MAX_DESCRIPTION },
    system_prompt: { type: 'string', minLength: 1, maxLength: MAX_PROMPT },
    input_contract: { type: 'array', minItems: 1, maxItems: MAX_LIST, items: { type: 'string', enum: ['job.request', ...CUSTOM_ROLE_ARTIFACT_TYPES] } },
    output_artifact_type: { type: 'string', enum: [...CUSTOM_ROLE_ARTIFACT_TYPES] },
    allowed_capabilities: { type: 'array', maxItems: MAX_LIST, items: { type: 'string', enum: [...CUSTOM_ROLE_CAPABILITIES] } },
    permissions: { type: 'array', minItems: 1, maxItems: MAX_LIST, items: { type: 'string', enum: [...CUSTOM_ROLE_PERMISSIONS] } },
    allowed_tools: { type: 'array', maxItems: MAX_LIST, items: { type: 'string', enum: [...CUSTOM_ROLE_ALLOWED_TOOLS] } },
    skills: { type: 'array', maxItems: MAX_SKILLS_PER_ROLE, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 2048, description: 'Local skill directory or public GitHub skill directory URL.' } }
  };
}

export function customRoleFingerprint(role) {
  return crypto.createHash('sha256').update(JSON.stringify(role)).digest('hex');
}
