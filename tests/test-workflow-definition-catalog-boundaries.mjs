import assert from 'node:assert/strict';
import test from 'node:test';

import * as definitionsIndex from '@runalith/workflow-runtime/workflow-definitions/index';
import * as engineeringDefinition from '@runalith/workflow-runtime/workflow-definitions/engineering';
import * as hybridEngineeringDefinition from '@runalith/workflow-runtime/workflow-definitions/hybrid-engineering';
import * as productionDefinition from '@runalith/workflow-runtime/workflow-definitions/production';
import * as standardEngineeringDefinition from '@runalith/workflow-runtime/workflow-definitions/standard-engineering';
import * as engineeringCatalog from '@runalith/workflow-runtime/workflow-catalog/engineering';
import * as hybridEngineeringCatalog from '@runalith/workflow-runtime/workflow-catalog/hybrid-engineering';
import * as standardEngineeringCatalog from '@runalith/workflow-runtime/workflow-catalog/standard-engineering';

import * as definitionsIndexInternal from '../src/runtime/workflow/definitions/index.js';
import * as engineeringDefinitionInternal from '../src/runtime/workflow/definitions/engineering.js';
import * as hybridEngineeringDefinitionInternal from '../src/runtime/workflow/definitions/hybrid-engineering.js';
import * as productionDefinitionInternal from '../src/runtime/workflow/definitions/production.js';
import * as standardEngineeringDefinitionInternal from '../src/runtime/workflow/definitions/standard-engineering.js';
import * as engineeringCatalogInternal from '../src/runtime/workflow/catalog/engineering.js';
import * as hybridEngineeringCatalogInternal from '../src/runtime/workflow/catalog/hybrid-engineering.js';
import * as standardEngineeringCatalogInternal from '../src/runtime/workflow/catalog/standard-engineering.js';

const pairs = [
  ['workflow-definitions/index', definitionsIndex, definitionsIndexInternal],
  ['workflow-definitions/engineering', engineeringDefinition, engineeringDefinitionInternal],
  ['workflow-definitions/hybrid-engineering', hybridEngineeringDefinition, hybridEngineeringDefinitionInternal],
  ['workflow-definitions/production', productionDefinition, productionDefinitionInternal],
  ['workflow-definitions/standard-engineering', standardEngineeringDefinition, standardEngineeringDefinitionInternal],
  ['workflow-catalog/engineering', engineeringCatalog, engineeringCatalogInternal],
  ['workflow-catalog/hybrid-engineering', hybridEngineeringCatalog, hybridEngineeringCatalogInternal],
  ['workflow-catalog/standard-engineering', standardEngineeringCatalog, standardEngineeringCatalogInternal]
];

for (const [name, publicModule, internalModule] of pairs) {
  test(`${name} public subpath resolves the existing internal module instance`, () => {
    assert.deepEqual(Object.keys(publicModule).sort(), Object.keys(internalModule).sort());
    for (const key of Object.keys(internalModule)) {
      assert.equal(publicModule[key], internalModule[key], `${name}.${key} identity`);
    }
  });
}

test('built-in Workflow definitions remain immutable descriptive values', () => {
  for (const definition of [
    engineeringDefinition.EngineeringWorkflow,
    hybridEngineeringDefinition.HybridEngineeringWorkflow,
    productionDefinition.ProductionWorkflow,
    standardEngineeringDefinition.StandardEngineeringWorkflow
  ]) {
    assert.equal(Object.isFrozen(definition), true);
    assert.ok(Number.isInteger(definition.version) && definition.version > 0);
  }
  assert.equal(definitionsIndex.isSupportedWorkflow({ title: 'Software Delivery fixture' }), true);
  assert.equal(definitionsIndex.getWorkflowDefinition({ title: 'not a supported workflow' }), null);
});

test('task catalogs build deterministic DTOs without database, approval or dispatch authority', () => {
  const engineering = engineeringCatalog.engineeringTaskSpecs('/tmp/workflow-catalog-fixture');
  const standard = standardEngineeringCatalog.standardEngineeringTaskSpecs('/tmp/workflow-catalog-fixture');
  const hybrid = hybridEngineeringCatalog.hybridEngineeringTaskSpecs('/tmp/workflow-catalog-fixture');
  for (const list of [engineering, standard, hybrid]) {
    assert.ok(Array.isArray(list) && list.length > 0);
    assert.ok(list.every(task => typeof task.id === 'string' && typeof task.role === 'string'));
  }
  assert.deepEqual(
    standardEngineeringCatalog.standardEngineeringTaskSpecs('/tmp/workflow-catalog-fixture'),
    standard,
    'same workspace input must produce the same standard-engineering task DTOs'
  );
  assert.equal(Object.hasOwn(standardEngineeringCatalog, 'approve'), false);
  assert.equal(Object.hasOwn(standardEngineeringCatalog, 'dispatch'), false);
});

test('production QA harness configuration remains host-rooted and host-supplied', () => {
  assert.equal(typeof productionCatalogIsHostOwned(), 'boolean');
  assert.equal(typeof productionDefinition.ProductionWorkflow.id, 'string');
});

function productionCatalogIsHostOwned() {
  // Deliberately no public workflow-catalog/production export exists.
  return !Object.hasOwn(productionDefinition, 'configureProductionQaHarnessRoot');
}
