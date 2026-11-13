import { createHash } from 'node:crypto';

/** Pure, versioned owner-approval vocabulary and canonical hashing contract. */
export const OWNER_APPROVAL_SCHEMA_VERSION = 1;
export const OWNER_APPROVAL_DOMAIN = 'runalith.owner-approval.v1';
export const OWNER_APPROVAL_SCOPE = 'workflow.dispatch';
export const OWNER_APPROVAL_MAX_TTL_MS = 15 * 60 * 1000;
export const OWNER_APPROVAL_DISPATCH_OPERATION_ID = 'runalith.workflow.dispatch.v1';
export const OWNER_APPROVAL_DISPATCH_OPERATION_VERSION = 1;
export const OWNER_APPROVAL_HUMAN_PRESENCE = 'controlling_tty.v1';

// No business action has yet been independently selected and accepted for the
// MVP. A dispatch signature must never authorize an arbitrary plan child.
export const OWNER_APPROVAL_ALLOWED_ACTION_IDS = Object.freeze([]);

const SHA256 = /^[a-f0-9]{64}$/;

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertWellFormedUnicode(value, label) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        fail('RUNALITH_OWNER_APPROVAL_CANONICAL_VALUE_INVALID', `${label} contains an unpaired high surrogate`);
      }
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      fail('RUNALITH_OWNER_APPROVAL_CANONICAL_VALUE_INVALID', `${label} contains an unpaired low surrogate`);
    }
  }
}

/** Deterministic canonical JSON for the signed owner-approval envelope. */
export function canonicalOwnerApprovalJson(value) {
  const ancestors = new Set();
  const encode = current => {
    if (current === null || typeof current === 'boolean') return JSON.stringify(current);
    if (typeof current === 'string') {
      assertWellFormedUnicode(current, 'string value');
      return JSON.stringify(current);
    }
    if (typeof current === 'number') {
      if (!Number.isSafeInteger(current) || Object.is(current, -0)) {
        fail('RUNALITH_OWNER_APPROVAL_CANONICAL_VALUE_INVALID', 'only finite safe integers are allowed in signed JSON values');
      }
      return JSON.stringify(current);
    }
    if (Array.isArray(current)) {
      if (ancestors.has(current)) fail('RUNALITH_OWNER_APPROVAL_CANONICAL_VALUE_INVALID', 'cyclic arrays are not allowed');
      ancestors.add(current);
      const result = `[${current.map(encode).join(',')}]`;
      ancestors.delete(current);
      return result;
    }
    if (!isRecord(current)) fail('RUNALITH_OWNER_APPROVAL_CANONICAL_VALUE_INVALID', 'signed JSON values must contain only plain objects, arrays, strings, booleans, null and safe integers');
    if (ancestors.has(current)) fail('RUNALITH_OWNER_APPROVAL_CANONICAL_VALUE_INVALID', 'cyclic objects are not allowed');
    ancestors.add(current);
    const keys = Object.keys(current).sort();
    const result = `{${keys.map(key => {
      assertWellFormedUnicode(key, 'object key');
      if (current[key] === undefined) fail('RUNALITH_OWNER_APPROVAL_CANONICAL_VALUE_INVALID', `undefined value at key ${key}`);
      return `${JSON.stringify(key)}:${encode(current[key])}`;
    }).join(',')}}`;
    ancestors.delete(current);
    return result;
  };
  return encode(value);
}

export function ownerApprovalDispatchArgumentsDigest({
  job_id, immutable_plan_sha256, role = 'cto', approved_action_id, approved_action_version
} = {}) {
  if (typeof job_id !== 'string' || !job_id.trim() || !SHA256.test(immutable_plan_sha256 || '') || role !== 'cto' ||
      typeof approved_action_id !== 'string' || !OWNER_APPROVAL_ALLOWED_ACTION_IDS.includes(approved_action_id) ||
      !Number.isSafeInteger(approved_action_version) || approved_action_version < 1) {
    fail('RUNALITH_OWNER_APPROVAL_ACTION_NOT_SELECTED', 'dispatch arguments require a currently allowlisted business action ID in addition to the fixed workflow dispatch role and immutable plan');
  }
  const canonical = canonicalOwnerApprovalJson({ job_id, immutable_plan_sha256, role, approved_action_id, approved_action_version });
  return createHash('sha256').update(canonical).digest('hex');
}
