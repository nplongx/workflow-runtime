# Built-in Workflow definitions and task catalogs

The package exposes its existing built-in Workflow descriptor modules and pure task-spec builders through explicit subpaths:

~~~js
import { getWorkflowDefinition, isSupportedWorkflow } from '@runalith/workflow-runtime/workflow-definitions/index';
import { StandardEngineeringWorkflow } from '@runalith/workflow-runtime/workflow-definitions/standard-engineering';
import { standardEngineeringTaskSpecs } from '@runalith/workflow-runtime/workflow-catalog/standard-engineering';
~~~

Public definition subpaths:

- `workflow-definitions/index`
- `workflow-definitions/engineering`
- `workflow-definitions/hybrid-engineering`
- `workflow-definitions/production`
- `workflow-definitions/standard-engineering`

Public task-catalog subpaths:

- `workflow-catalog/engineering`
- `workflow-catalog/hybrid-engineering`
- `workflow-catalog/standard-engineering`

These subpaths are export-map entries for the exact module files already consumed internally by Workflow Runtime. They do not duplicate source modules or create another registry. Definitions remain immutable declarations; catalog functions build task-spec DTOs and do not insert tasks, persist plans, assign roles, authorize execution, approve workflows or dispatch work.

## Deliberate production-catalog exception

`workflow/catalog/production.js` remains host-bound. Its QA assessment resolves and reads `tests/test-production-behavioral-qa.js` relative to the host plugin root and validates exact bytes against a pinned SHA-256 digest. The host still supplies that harness and filesystem root. Do not replace this module with a generic package-relative facade without an explicit root-injection/identity migration and independent runtime regression evidence.

Workflow Runtime owns schema, compiler, lifecycle and transaction coordination; these pure descriptors/catalogs are configuration inputs to those paths, not new authorization or lifecycle authorities.
