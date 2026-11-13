# Compiled Agent Contracts

Import the Workflow-specific compiled task-input contract API:

~~~js
import {
  configureCompiledActionIntentSemanticVerifier,
  validateCompiledActionIntent
} from '@runalith/workflow-runtime/agent-contracts';
~~~

`validateCompiledActionIntent(role, intent, expectedTaskId)` checks the exact version-1 compiled action-intent shape, task/role contract identity, source-step identity, source lineage hashes, sorted dependency IDs, and every role-declared artifact input binding. Evidence bindings must contain the required artifact identity, content hash, schema version, creator event and successful producer result/completion lineage. Ancestor-output bindings must carry the exact task/step/role contract identity.

## Host semantic verifier

AGG-specific semantic policy is intentionally not implemented by this package. The composing host must call `configureCompiledActionIntentSemanticVerifier(verifier)` once during composition. The callback must be the host's AGG semantic verifier. Configuration is immutable: reconfiguring the module with a different callback throws.

`@runalith/workflow-runtime/workflow-plan` imports this same module instance and exports the same `configureCompiledActionIntentSemanticVerifier` function. The two subpaths must never be independently copied into a host bundle, because that would create separate configuration closures and make Plan validation see an unconfigured verifier.

This API does not approve a task, establish reviewer identity, verify trust signatures, authorize dispatch or execute tools. The host retains compiled graph/AGG semantic verification and all approval, trust and dispatch authority.
