#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-runtime-packed-consumer-'));
const consumerRoot = path.join(temporaryRoot, 'consumer');
const environment = {
  ...process.env,
  npm_config_update_notifier: 'false',
  npm_config_fund: 'false',
  npm_config_audit: 'false'
};

function run(command, args, cwd, label, env = environment) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed (status=${result.status}, signal=${result.signal}):\n${result.stdout || ''}\n${result.stderr || ''}\n${result.error?.message || ''}`);
  }
  return result.stdout.trim();
}

try {
  fs.mkdirSync(consumerRoot, { mode: 0o700 });
  const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', temporaryRoot], root, 'npm pack'));
  assert.equal(packed.length, 1);
  assert.equal(packed[0].name, '@runalith/workflow-runtime');
  assert.equal(packed[0].version, '0.3.9');
  const tarball = path.join(temporaryRoot, packed[0].filename);
  assert.ok(fs.statSync(tarball).size > 10_000);

  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', consumerRoot, tarball], root,
    'install packed workflow-runtime into clean consumer');

  const databasePath = path.join(temporaryRoot, 'must-not-open-on-import', 'workflow.db');
  const smoke = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { DatabaseSync } from 'node:sqlite';
    const api = await import('@runalith/workflow-runtime');
    const phases = await import('@runalith/workflow-runtime/phases');
    const artifactNormalizer = await import('@runalith/workflow-runtime/artifact-normalizer');
    const successContracts = await import('@runalith/workflow-runtime/success-contract');
    const roles = await import('@runalith/workflow-runtime/roles');
    const roleProfiles = await import('@runalith/workflow-runtime/role-profiles');
    const evidence = await import('@runalith/workflow-runtime/evidence');
    const workspaceWrite = await import('@runalith/workflow-runtime/workspace-write-contract');
    const compiledAgentContracts = await import('@runalith/workflow-runtime/agent-contracts');
    const workflowPlan = await import('@runalith/workflow-runtime/workflow-plan');
    const workflowDefinitions = await import('@runalith/workflow-runtime/workflow-definitions/index');
    const engineeringDefinition = await import('@runalith/workflow-runtime/workflow-definitions/engineering');
    const standardEngineeringDefinition = await import('@runalith/workflow-runtime/workflow-definitions/standard-engineering');
    const productionDefinition = await import('@runalith/workflow-runtime/workflow-definitions/production');
    const engineeringCatalog = await import('@runalith/workflow-runtime/workflow-catalog/engineering');
    const hybridCatalog = await import('@runalith/workflow-runtime/workflow-catalog/hybrid-engineering');
    const standardEngineeringCatalog = await import('@runalith/workflow-runtime/workflow-catalog/standard-engineering');
    const recoveryCompatibility = await import('@runalith/workflow-runtime/recovery-compatibility');
    const workflowErrors = await import('@runalith/workflow-runtime/tool-errors');
    const agentContracts = await import('@runalith/agent-contracts');
    const workspaceFilesystem = await import('@runalith/workspace-runtime/filesystem');
    assert.equal(fs.existsSync(${JSON.stringify(databasePath)}), false, 'package import created host database');
    assert.equal(typeof api.createRunalithWorkflowStore, 'function');
    assert.equal(typeof api.createWorkflowStatePort, 'function');
    assert.equal(typeof api.createExecutionStatePort, 'function');
    assert.equal(typeof api.ExecutionStateStore, 'function');
    assert.equal(typeof api.ExecutionPersistenceStore, 'function');
    assert.equal(typeof api.configureProductionQaHarnessRoot, 'function');
    assert.equal(typeof api.configureCompiledActionIntentSemanticVerifier, 'function');
    assert.equal(api.WORKFLOW_PLAN_API_VERSION, 1);
    assert.equal(Object.isFrozen(phases.WorkflowPhase), true);
    assert.equal(Object.isFrozen(phases.PRODUCTION_PHASES), true);
    assert.equal(phases.WorkflowPhase.RUN_CHILDREN, 'RUN_CHILDREN');
    assert.deepEqual(phases.PRODUCTION_PHASES, Object.values(phases.WorkflowPhase));
    const reviewText = JSON.stringify({review:{requirementsSatisfied:true,architectureConformant:true,implementationIssues:[],evidenceIssues:[],blockingIssues:[]}});
    assert.equal(typeof artifactNormalizer.normalizeReviewerArtifact(reviewText), 'string');
    assert.deepEqual(artifactNormalizer.parseReviewerArtifact(reviewText), JSON.parse(reviewText));
    const successContract = successContracts.normalizeSuccessContract({goal:'Packed consumer contract.', success_criteria:[{id:'all-done',type:'all_tasks_completed'}]});
    assert.equal(successContracts.validateSuccessContract(successContract).schema_version, 1);
    assert.equal(successContracts.hasEnforcedSuccessCriteria(successContract), true);
    assert.equal(typeof successContracts.successContractPrompt(successContract), 'string');
    assert.equal(successContracts.evaluateSuccessPredicate(successContract.success_criteria[0], {
      plan:{children:[{id:'build'}]}, tasks:[{status:'completed',metadata_json:'{"workflow_plan_task_id":"build"}'}]
    }).passed, true);
    assert.deepEqual(successContracts.validateSuccessAssessment(successContract, {
      goal_status:'achieved',summary:'All work complete.',criteria:[{id:'all-done',status:'met',evidence_refs:[]}],constraints:[]
    }, {plan:{children:[{id:'build'}]},tasks:[{status:'completed',metadata_json:'{"workflow_plan_task_id":"build"}'}]}), {valid:true,errors:[]});
    assert.equal(Object.isFrozen(roles.TaskCapability), true);
    assert.equal(Object.isFrozen(roles.ROLE_CONTRACTS), true);
    assert.equal(roles.validateRoleContract('engineer', { capability: roles.TaskCapability.CODE_MODIFY }).id, 'agent.engineer');
    assert.equal(roles.getRoleContract('productowner').id, 'agent.product-owner');
    assert.equal(Object.isFrozen(roleProfiles.BUILTIN_ROLE_PROFILE_OVERLAY_ROLES), true);
    assert.equal(typeof roleProfiles.normalizeRoleProfileBindings, 'function');
    assert.equal(typeof roleProfiles.resolveRoleProfileBindings, 'function');
    assert.equal(typeof roleProfiles.createRoleProfileOverlay, 'function');
    assert.equal(typeof roleProfiles.validateRoleProfileOverlay, 'function');
    const profileDb = new DatabaseSync(':memory:');
    try {
      profileDb.exec('CREATE TABLE custom_role_versions(role_id TEXT NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, system_prompt TEXT NOT NULL, input_contract_json TEXT NOT NULL, output_artifact_type TEXT NOT NULL, allowed_capabilities_json TEXT NOT NULL, permissions_json TEXT NOT NULL, allowed_tools_json TEXT NOT NULL, skills_json TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL, PRIMARY KEY(role_id,version))');
      profileDb.prepare('INSERT INTO custom_role_versions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        'architecture-profile', 2, 'Architecture Profile', 'Pinned profile.', 'Use evidence.',
        '["job.request","requirements","research"]', 'architecture', '[]',
        '["workspace.read","artifact.create"]', '[]', '[]', '2026-01-01T00:00:00.000Z', 'test'
      );
      const pins = roleProfiles.normalizeRoleProfileBindings(profileDb, 'standard-engineering', [
        { role: 'architect', custom_role_id: 'architecture-profile', custom_role_version: 2 }
      ]);
      assert.equal(pins.length, 1);
      assert.match(pins[0].profile_hash, /^[a-f0-9]{64}$/);
      const resolved = roleProfiles.resolveRoleProfileBindings(profileDb, pins);
      assert.equal(resolved[0].profile.role_id, 'architecture-profile');
      assert.equal(Object.hasOwn(resolved[0].profile, 'permissions'), false);
      assert.equal(Object.hasOwn(resolved[0].profile, 'allowed_tools'), false);
      const overlay = roleProfiles.createRoleProfileOverlay('architect', resolved[0].profile, resolved[0].profile_hash);
      assert.equal(roleProfiles.validateRoleProfileOverlay('architect', overlay), true);
      assert.throws(() => roleProfiles.validateRoleProfileOverlay('architect', { ...overlay, profile_hash: '0'.repeat(64) }), /hash mismatch/);
      assert.throws(() => roleProfiles.normalizeRoleProfileBindings(profileDb, 'standard-engineering', [
        { role: 'architect', custom_role_id: 'architecture-profile', custom_role_version: 2 },
        { role: 'architect', custom_role_id: 'architecture-profile', custom_role_version: 2 }
      ]), /duplicate role profile binding/);
    } finally { profileDb.close(); }
    const evidenceTask = {
      task_id: 'task-evidence-1', status: 'completed', execution_exit_code: 0, execution_status: 'completed',
      execution_stdout: 'ok\\n', execution_stderr: '', execution_session_id: 'session-evidence-1', execution_attempt: 2,
      metadata_json: JSON.stringify({ executor: 'ExecutionManager', command: 'node build.js' })
    };
    const plannedExecution = { executor: 'ExecutionManager', command: 'node build.js' };
    const result = { outcome: 'success', content: evidence.canonicalExecutionEvidenceContent({
      taskId: evidenceTask.task_id, executionSessionId: evidenceTask.execution_session_id,
      attempt: evidenceTask.execution_attempt, command: 'node build.js', exitCode: 0,
      status: 'completed', stdout: evidenceTask.execution_stdout, stderr: evidenceTask.execution_stderr
    }) };
    assert.equal(evidence.executionEvidence(evidenceTask, result, plannedExecution).taskId, evidenceTask.task_id);
    assert.equal(evidence.validateEvidenceContract(evidenceTask, result, plannedExecution).valid, true);
    assert.equal(evidence.validateEvidenceContract({ ...evidenceTask, execution_exit_code: 1 }, result, plannedExecution).valid, false);
    assert.equal(typeof workspaceWrite.normalizeWorkspaceWriteContract, 'function');
    assert.equal(typeof workspaceWrite.pathIsWithinWorkspaceWriteScope, 'function');
    assert.equal(typeof workspaceWrite.workspaceWriteScopeForRole, 'function');
    assert.equal(workspaceWrite.normalizeWorkspaceWriteContract({
      workflowId: 'standard-engineering', workflowVersion: 3, workspace: process.cwd(),
      requiredOperations: [], scopes: []
    }), null);
    assert.equal(agentContracts.getAgentContract('engineer').id, 'agent.engineer');
    assert.equal(typeof workspaceFilesystem.openDirectoryWithin, 'function');
    assert.equal(typeof workspaceFilesystem.lstatWithin, 'function');
    assert.equal(typeof compiledAgentContracts.validateCompiledActionIntent, 'function');
    assert.equal(typeof compiledAgentContracts.configureCompiledActionIntentSemanticVerifier, 'function');
    assert.equal(compiledAgentContracts.configureCompiledActionIntentSemanticVerifier,
      workflowPlan.configureCompiledActionIntentSemanticVerifier,
      'public Workflow Plan API and Agent Contracts subpath must share one verifier configuration closure');
    assert.equal(workflowDefinitions.getWorkflowDefinition({ title: 'Software Delivery fixture' }).id, 'standard-engineering');
    assert.equal(engineeringDefinition.EngineeringWorkflow.id, 'engineering');
    assert.equal(standardEngineeringDefinition.StandardEngineeringWorkflow.id, 'standard-engineering');
    assert.equal(productionDefinition.ProductionWorkflow.id, 'production');
    assert.ok(engineeringCatalog.engineeringTaskSpecs('/tmp').length > 0);
    assert.ok(hybridCatalog.hybridEngineeringTaskSpecs('/tmp').length > 0);
    assert.ok(standardEngineeringCatalog.standardEngineeringTaskSpecs('/tmp').length > 0);
    assert.equal(recoveryCompatibility.supportsReviewDrivenRecovery({ workflow_id: 'standard-engineering', workflow_version: 2 }), true);
    assert.equal(recoveryCompatibility.classifyReviewRecovery({ plan: { workflow_id: 'standard-engineering', workflow_version: 3 }, job: { state: 'EXECUTING', status: 'active' } }).supported, true);
    assert.equal(typeof workflowErrors.WorkflowToolError, 'function');
    assert.equal(workflowErrors.isWorkflowToolError(new workflowErrors.WorkflowToolError('packed consumer')), true);
    assert.equal(typeof api.workflowPlanApi.validateExecutionPlan, 'function');
    const planApi = await import('@runalith/workflow-runtime/workflow-plan');
    assert.equal(planApi.WORKFLOW_PLAN_API_VERSION, 1);
    assert.equal(typeof planApi.configureCompiledActionIntentSemanticVerifier, 'function');
    assert.equal(planApi.workflowPlanApi.canonicalJson({b:2,a:1}), '{\"a\":1,\"b\":2}');
    const database = new DatabaseSync(':memory:');
    try {
      const store = api.createRunalithWorkflowStore(database);
      assert.equal(store.db, database);
      assert.equal(store.agentSessions.version, 1);
      const job = store.createJob({ conversationKey: 'packed-consumer-smoke', title: 'Clean consumer' });
      assert.equal(store.getJob(job.job_id).job_id, job.job_id);
      assert.deepEqual(store.agentSessions.listActiveAgentSessionsForJob(job.job_id), []);
      assert.deepEqual(store.agentSessions.getSessionTraceForJob(job.job_id), { sessions: [], sessionMessages: [] });
      assert.equal(fs.existsSync(${JSON.stringify(databasePath)}), false, 'injected DB path unexpectedly opened');
    } finally { database.close(); }
    console.log('packed consumer API, injected SQLite, Agent Session composition and import side-effect PASS');
  `;
  run(process.execPath, ['--input-type=module', '-e', smoke], consumerRoot, 'packed consumer API smoke', {
    ...environment,
    WORKFLOW_DB: databasePath,
    WORKFLOW_DATA_DIR: path.dirname(databasePath)
  });
  console.log(`Workflow Runtime packed consumer PASS: ${packed[0].filename} (${packed[0].entryCount} package files, ${packed[0].size} bytes)`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
