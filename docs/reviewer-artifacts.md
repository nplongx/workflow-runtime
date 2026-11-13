# Reviewer artifact normalization

`@runalith/workflow-runtime/artifact-normalizer` exposes a pure parser for reviewer artifact content.

~~~js
import { normalizeReviewerArtifact, parseReviewerArtifact } from '@runalith/workflow-runtime/artifact-normalizer';

const normalizedJson = normalizeReviewerArtifact(rawProviderText);
const review = parseReviewerArtifact(rawProviderText);
~~~

`normalizeReviewerArtifact(rawContent)` returns a canonical JSON string when it finds a valid reviewer artifact, otherwise `null`. `parseReviewerArtifact(rawContent)` returns the parsed DTO or `null`. Input may be direct JSON, a JSON-encoded JSON string, an array of text/content wrappers, or text containing a reviewer JSON object. Parsing uses the strict parser from the pinned Workflow Contracts package.

The accepted shape requires `review.requirementsSatisfied` and `review.architectureConformant` booleans plus string arrays `implementationIssues`, `evidenceIssues`, and `blockingIssues`.

## Ownership boundary

This module only normalizes and structurally validates text. It does not identify or authenticate the reviewer, verify signatures, bind reviewer identity to a candidate, persist an attestation, record an approval, append Workflow events, write artifacts, or authorize completion. Trust-root configuration, reviewer attestations, approval policy, persistence and lifecycle remain host/Workflow authority.
