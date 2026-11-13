// Pure custom Workflow definition contract. Role snapshots are resolved and
// version-pinned by the host; this module validates only detached data.
const ARTIFACT_TYPES = Object.freeze([
  'requirements', 'research', 'architecture', 'implementation', 'security-review',
  'qa-report', 'platform-review', 'documentation', 'review', 'cto-decision'
]);
const MAX_TASKS = 32;
const ALLOWED_WORKFLOW_KEYS = new Set(['workflow_id', 'name', 'description', 'input_contract', 'tasks']);
const ALLOWED_TASK_KEYS = new Set(['id', 'role_id', 'role_version', 'depends_on', 'input_contract', 'output_artifact_type']);

function text(value, field, max) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string`);
  const result = value.trim();
  if (result.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return result;
}

function slug(value, field = 'workflow_id') {
  const result = text(value, field, 80);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(result)) throw new Error(`${field} must be a lowercase slug`);
  if (['engineering', 'standard-engineering', 'production'].includes(result)) throw new Error(`${field} conflicts with a built-in workflow`);
  return result;
}

function stringList(value, field, allowed, { required = false } = {}) {
  if (!Array.isArray(value) || value.length > 32) throw new Error(`${field} must be an array with at most 32 entries`);
  const list = value.map((item, index) => text(item, `${field}[${index}]`, 120));
  if (new Set(list).size !== list.length) throw new Error(`${field} must not contain duplicates`);
  if (required && !list.length) throw new Error(`${field} must contain at least one entry`);
  if (allowed && list.some(item => !allowed.includes(item))) throw new Error(`${field} contains unsupported values`);
  return list;
}

function normalizeHeaderAndTaskReferences(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new Error('custom workflow definition must be a plain object');
  }
  const unsupportedTopLevel = Object.keys(input).filter(key => !ALLOWED_WORKFLOW_KEYS.has(key));
  if (unsupportedTopLevel.length) throw new Error(`custom workflow definition contains unsupported fields: ${unsupportedTopLevel.join(', ')}`);
  const workflowId = slug(input.workflow_id);
  const name = text(input.name, 'name', 120);
  const description = text(input.description, 'description', 2000);
  const inputContract = stringList(input.input_contract, 'input_contract', ['job.request', ...ARTIFACT_TYPES], { required: true });
  if (!Array.isArray(input.tasks) || input.tasks.length < 1 || input.tasks.length > MAX_TASKS) {
    throw new Error(`tasks must contain 1-${MAX_TASKS} entries`);
  }
  const ids = new Set();
  const taskReferences = input.tasks.map((task, index) => {
    if (!task || typeof task !== 'object' || Array.isArray(task) || ![Object.prototype, null].includes(Object.getPrototypeOf(task))) {
      throw new Error(`tasks[${index}] must be an object`);
    }
    const unsupported = Object.keys(task).filter(key => !ALLOWED_TASK_KEYS.has(key));
    if (unsupported.length) throw new Error(`tasks[${index}] contains unsupported fields: ${unsupported.join(', ')}`);
    const id = slug(task.id, `tasks[${index}].id`);
    if (ids.has(id)) throw new Error(`duplicate task id: ${id}`);
    ids.add(id);
    const roleId = slug(task.role_id, `tasks[${index}].role_id`);
    if (task.role_version != null && (!Number.isInteger(task.role_version) || task.role_version < 1)) {
      throw new Error(`tasks[${index}].role_version must be a positive integer`);
    }
    return { task_id: id, role_id: roleId, role_version: task.role_version ?? null };
  });
  return { workflow_id: workflowId, name, description, input_contract: inputContract, taskReferences };
}

/** Return bounded role lookup requests without accessing a database. */
export function getCustomWorkflowRoleLookupRequests(input) {
  const normalized = normalizeHeaderAndTaskReferences(input);
  return normalized.taskReferences.map(reference => ({ ...reference }));
}

/** Normalize and validate a custom Workflow using host-resolved role snapshots. */
export function normalizeCustomWorkflowDefinition(input, { roleSnapshotsByTaskId } = {}) {
  const header = normalizeHeaderAndTaskReferences(input);
  if (!roleSnapshotsByTaskId || typeof roleSnapshotsByTaskId !== 'object' || Array.isArray(roleSnapshotsByTaskId)) {
    throw new Error('roleSnapshotsByTaskId must be an object keyed by task ID');
  }
  const tasks = input.tasks.map((task, index) => {
    const reference = header.taskReferences[index];
    const role = roleSnapshotsByTaskId[reference.task_id];
    if (!role || typeof role !== 'object' || Array.isArray(role)) {
      throw new Error(`custom workflow role snapshot is missing for task ${reference.task_id}`);
    }
    if (role.role_id !== reference.role_id) {
      throw new Error(`custom workflow role snapshot identity mismatch for task ${reference.task_id}`);
    }
    if (!Number.isInteger(role.version) || role.version < 1 ||
        (reference.role_version != null && role.version !== reference.role_version)) {
      throw new Error(`custom workflow role snapshot version mismatch for task ${reference.task_id}`);
    }
    const taskInput = stringList(task.input_contract ?? role.input_contract, `tasks[${index}].input_contract`, ['job.request', ...ARTIFACT_TYPES], { required: true });
    if (!Array.isArray(role.input_contract)) throw new Error(`pinned role ${reference.role_id}@${role.version} has an invalid input contract`);
    const unsupportedInputs = taskInput.filter(type => !role.input_contract.includes(type));
    if (unsupportedInputs.length) throw new Error(`task ${reference.task_id} input contract is not supported by role ${reference.role_id}@${role.version}: ${unsupportedInputs.join(', ')}`);
    const output = task.output_artifact_type ?? role.output_artifact_type;
    if (!ARTIFACT_TYPES.includes(output)) throw new Error(`tasks[${index}].output_artifact_type is unsupported`);
    if (output !== role.output_artifact_type) throw new Error(`task ${reference.task_id} output type ${output} does not match pinned role ${reference.role_id}@${role.version} output ${role.output_artifact_type}`);
    return {
      id: reference.task_id,
      role_id: reference.role_id,
      role_version: role.version,
      input_contract: taskInput,
      output_artifact_type: output,
      depends_on: stringList(task.depends_on ?? [], `tasks[${index}].depends_on`)
    };
  });
  const byId = new Map(tasks.map(task => [task.id, task]));
  for (const task of tasks) for (const dep of task.depends_on) {
    if (!byId.has(dep)) throw new Error(`task ${task.id} depends on unknown task: ${dep}`);
    if (!task.input_contract.includes(byId.get(dep).output_artifact_type)) {
      throw new Error(`task ${task.id} input contract must include predecessor artifact type ${byId.get(dep).output_artifact_type} from ${dep}`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error(`dependency cycle detected at task: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of byId.get(id).depends_on) visit(dep);
    visiting.delete(id);
    visited.add(id);
  }
  for (const task of tasks) visit(task.id);
  return {
    workflow_id: header.workflow_id,
    name: header.name,
    description: header.description,
    input_contract: header.input_contract,
    tasks
  };
}
