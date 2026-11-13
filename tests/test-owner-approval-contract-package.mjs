import assert from 'node:assert/strict';
import { OWNER_APPROVAL_ALLOWED_ACTION_IDS, OWNER_APPROVAL_DOMAIN, OWNER_APPROVAL_SCOPE, OWNER_APPROVAL_SCHEMA_VERSION, canonicalOwnerApprovalJson, ownerApprovalDispatchArgumentsDigest } from '../src/runtime/owner-approval-contract.js';
assert.equal(OWNER_APPROVAL_SCHEMA_VERSION, 1); assert.equal(OWNER_APPROVAL_DOMAIN, 'runalith.owner-approval.v1'); assert.equal(OWNER_APPROVAL_SCOPE, 'workflow.dispatch');
assert.deepEqual(OWNER_APPROVAL_ALLOWED_ACTION_IDS, []); assert.equal(Object.isFrozen(OWNER_APPROVAL_ALLOWED_ACTION_IDS), true);
assert.equal(canonicalOwnerApprovalJson({ z: 1, a: true }), '{\"a\":true,\"z\":1}');
assert.throws(() => canonicalOwnerApprovalJson({ n: -0 }), { code: 'RUNALITH_OWNER_APPROVAL_CANONICAL_VALUE_INVALID' });
assert.throws(() => ownerApprovalDispatchArgumentsDigest({ job_id: 'j', immutable_plan_sha256: 'a'.repeat(64), role: 'cto', approved_action_id: 'not-selected', approved_action_version: 1 }), { code: 'RUNALITH_OWNER_APPROVAL_ACTION_NOT_SELECTED' });
console.log('Owner approval protocol contract PASS; host verifier remains external');
