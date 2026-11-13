import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeReviewerArtifact, parseReviewerArtifact } from '../src/runtime/workflow/artifact-normalizer.js';

const validReview = Object.freeze({
  review: Object.freeze({
    requirementsSatisfied: true,
    architectureConformant: true,
    implementationIssues: Object.freeze(['one issue']),
    evidenceIssues: Object.freeze([]),
    blockingIssues: Object.freeze([])
  })
});
const json = JSON.stringify(validReview);

test('parses direct reviewer JSON into the exact validated DTO', () => {
  assert.equal(normalizeReviewerArtifact(json), json);
  assert.deepEqual(parseReviewerArtifact(json), validReview);
});

test('extracts reviewer JSON from nested JSON strings and MCP-style text wrappers', () => {
  assert.deepEqual(parseReviewerArtifact(JSON.stringify(json)), validReview);
  assert.deepEqual(parseReviewerArtifact(JSON.stringify([{ type: 'text', text: json }])), validReview);
  assert.deepEqual(parseReviewerArtifact(JSON.stringify({ content: json })), validReview);
  assert.deepEqual(parseReviewerArtifact(JSON.stringify({ result: validReview })), validReview);
});

test('extracts the last valid review object from surrounding provider text', () => {
  assert.deepEqual(parseReviewerArtifact(`provider preamble\n${json}\nprovider trailer`), validReview);
});

test('rejects structurally incomplete or incorrectly typed reviewer DTOs', () => {
  for (const input of [
    JSON.stringify({ review: {} }),
    JSON.stringify({ review: { ...validReview.review, requirementsSatisfied: 'true' } }),
    JSON.stringify({ review: { ...validReview.review, implementationIssues: [1] } })
  ]) {
    assert.equal(normalizeReviewerArtifact(input), null);
    assert.equal(parseReviewerArtifact(input), null);
  }
});

test('malformed JSON and unrelated text return null without throwing', () => {
  assert.equal(normalizeReviewerArtifact('{"review":'), null);
  assert.equal(parseReviewerArtifact('provider returned no review artifact'), null);
});
