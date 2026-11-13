import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs'; import { tmpdir } from 'node:os'; import path from 'node:path';
import { configureProductionQaHarnessRoot, ProductionTaskId, productionTaskSpec, assessProductionQaExecution } from '../src/runtime/workflow/catalog/production.js';
const workspace = path.join(tmpdir(), 'workflow-runtime-production-fixture');
assert.equal(productionTaskSpec(ProductionTaskId.CTO_SYNTHESIS, { workspace }).role, 'cto');
assert.throws(() => productionTaskSpec(ProductionTaskId.QA_CHECK, { workspace }), /production behavioral QA harness is not configured/);
const denied = assessProductionQaExecution({ plan: { workflow_id: 'production', children: [] }, taskPlanId: ProductionTaskId.QA_CHECK, metadata: {}, stdout: '' }); assert.equal(denied.trusted, false);
const empty = mkdtempSync(path.join(tmpdir(), 'workflow-runtime-no-qa-root-')); try { assert.throws(() => configureProductionQaHarnessRoot(empty), /harness is missing/); } finally { rmSync(empty, { recursive: true, force: true }); }
console.log('Production QA host injection: import remains standalone; missing harness fails closed');
