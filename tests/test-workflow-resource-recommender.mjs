import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendReusableResourcesFromReadModels } from '../src/runtime/workflow/resource-recommender.js';

const snapshot = {
  task: 'Rà soát bảo mật ứng dụng, tìm lỗ hổng và kiểm tra quyền truy cập.',
  roles: [{
    role_id: 'security-reviewer', version: 2, name: 'Security Threat Reviewer',
    description: 'Review application security, authentication, authorization, vulnerabilities and trust boundaries.',
    input_contract: ['job.request', 'requirements', 'architecture', 'implementation'],
    output_artifact_type: 'security-review', allowed_capabilities: ['security.audit'],
    skills: [{ name: 'threat-modeling', description: 'Threat model', sha256: 'a'.repeat(64) }]
  }],
  workflows: [{
    workflow_id: 'security-review-flow', version: 3, name: 'Security Review Flow',
    description: 'Review code for vulnerabilities, authentication and authorization boundaries, and write a security report.',
    input_contract: ['job.request'],
    tasks: [{ id: 'security-review', role_id: 'security-reviewer', role_version: 2,
      output_artifact_type: 'security-review', input_contract: ['job.request'] }]
  }],
  policies: [{
    policy_id: 'security-review-gates', version: 1, name: 'Security Review Gates',
    description: 'Require all planned tasks to complete successfully and use approved local execution contracts.',
    content_hash: 'b'.repeat(64),
    constraints: [{ id: 'completed-work', type: 'all_tasks_completed' }, { id: 'local-only', type: 'local_execution_only' }],
    success_criteria: []
  }],
  compatibleProfileOverlayRolesByRole: { 'security-reviewer': ['security'] }
};

test('pure read-model recommender preserves role/workflow/policy and built-in role ordering', () => {
  const result = recommendReusableResourcesFromReadModels(snapshot, { limit: 5 });
  assert.equal(result.read_only, true);
  assert.match(result.matching_method, /lexical/i);
  assert.equal(result.recommendations.custom_roles_and_skills[0]?.role_id, 'security-reviewer');
  assert.deepEqual(result.recommendations.custom_roles_and_skills[0].compatible_profile_overlay_roles, ['security']);
  assert.equal(result.recommendations.custom_roles_and_skills[0].skill_hints[0].name, 'threat-modeling');
  assert.equal(result.recommendations.custom_workflows[0]?.workflow_id, 'security-review-flow');
  assert.equal(result.recommendations.workflow_policies[0]?.policy_id, 'security-review-gates');
  assert.equal(result.recommendations.workflow_policies[0]?.reuse_scope, 'portable_candidate');
  assert.equal(result.recommendations.workflow_policies[0]?.attachment_requires_target_plan_validation, true);
  assert.equal(result.recommendations.built_in_role_hints[0]?.role, 'security');
  assert.equal(result.recommendations.custom_roles_and_skills[0].execution_authorized, false);
});

test('resource scoring is deterministic for Vietnamese/English phrase expansion', () => {
  const first = recommendReusableResourcesFromReadModels(snapshot, { limit: 3 });
  const second = recommendReusableResourcesFromReadModels(snapshot, { limit: 3 });
  assert.deepEqual(first, second);
  assert.equal(first.task_fingerprint, 'cap dung hong kiem mat quyen soat tim tra truy ung');
});

test('read-model recommender rejects malformed query and non-array read models', () => {
  assert.throws(() => recommendReusableResourcesFromReadModels({ ...snapshot, task: ' ' }), /non-empty/);
  assert.throws(() => recommendReusableResourcesFromReadModels({ ...snapshot, task: 'x'.repeat(12001) }), /12000/);
  assert.throws(() => recommendReusableResourcesFromReadModels({ ...snapshot, roles: {} }), /roles, workflows and policies arrays/);
  assert.throws(() => recommendReusableResourcesFromReadModels({ ...snapshot, compatibleProfileOverlayRolesByRole: [] }), /object keyed by custom role ID/);
});

test('no database, approval, attachment, role resolution or dispatch exports are exposed', async () => {
  const api = await import('../src/runtime/workflow/resource-recommender.js');
  assert.deepEqual(Object.keys(api), ['recommendReusableResourcesFromReadModels']);
});
