import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as workflowContracts from '@runalith/workflow-contracts';
import * as packageArtifactFacade from '../src/runtime/workflow/artifacts.js';

test('Workflow Runtime artifact path is a direct compatibility re-export of Workflow Contracts', () => {
  const source = fs.readFileSync(new URL('../src/runtime/workflow/artifacts.js', import.meta.url), 'utf8');
  assert.match(source, /from ['"]@runalith\/workflow-contracts['"]/);
  assert.doesNotMatch(source, /function (?:hashArtifactContent|createArtifactRecord|validateArtifact|validateArtifactContent|artifactSchemaForType)/);
  assert.deepEqual(Object.keys(packageArtifactFacade).sort(), [
    'ArtifactStatus', 'ArtifactType', 'artifactSchemaForType', 'createArtifactRecord',
    'hashArtifactContent', 'validateArtifact', 'validateArtifactContent'
  ]);
  for (const name of Object.keys(packageArtifactFacade)) {
    assert.equal(packageArtifactFacade[name], workflowContracts[name], `${name} must have one Workflow Contracts implementation`);
  }
});

test('Workflow Runtime legacy store module preserves artifact hash, validation and schema behavior', () => {
  const artifact = packageArtifactFacade.createArtifactRecord({
    artifact_id: 'artifact-contract-boundary',
    job_id: 'job-contract-boundary',
    task_id: 'task-contract-boundary',
    type: packageArtifactFacade.ArtifactType.REQUIREMENTS,
    producer_role: 'product-owner',
    content: { scope: 'Single owner', acceptance_criteria: ['stable'], non_goals: [] },
    evidence: ['fixture:contract-boundary'],
    created_at: '2026-11-13T00:00:00.000Z'
  });
  assert.equal(packageArtifactFacade.validateArtifact(artifact), true);
  assert.equal(artifact.content_hash, workflowContracts.hashArtifactContent(artifact.content));
  assert.deepEqual(packageArtifactFacade.artifactSchemaForType(packageArtifactFacade.ArtifactType.REQUIREMENTS), {
    type: 'requirements', schema_version: 1,
    required_content_fields: ['scope', 'acceptance_criteria', 'non_goals']
  });
  assert.throws(() => packageArtifactFacade.validateArtifact({ ...artifact, content_hash: '0'.repeat(64) }), /content_hash mismatch/);
});
