import { WorkflowStore, WORKFLOW_DB_PATH } from './job-store.js';
import { AgentSessionStore } from './agent-session-store.js';
import { AGENT_SESSION_API_METHODS, createAgentSessionApi, createAgentSessionPort,
  createAgentSessionLifecycleParticipant } from './agent-session-api.js';
import { createWorkflowStatePort } from './workflow-state-port.js';
import { ExecutionPersistenceStore } from './execution-persistence-store.js';
import { createExecutionPersistenceParticipant } from './execution-persistence-participant.js';

/** Host composition root for Workflow and Agent Session within one SQLite unit. */
export class RunalithWorkflowStore extends WorkflowStore {
  constructor(database) {
    super(database);
    const executionPersistenceStore = new ExecutionPersistenceStore(this.db);
    const workflowState = createWorkflowStatePort(this, { executionPersistenceStore });
    this.attachExecutionPersistenceParticipant(createExecutionPersistenceParticipant(executionPersistenceStore, this.db));
    const agentSessionStore = new AgentSessionStore({
      database: this.db,
      workflowPort: workflowState,
      deliveryHooks: Object.freeze({
        ackSessionMessage: (...args) => this.ackSessionMessage(...args),
        markSessionMessageDeliveryUncertain: (...args) => this.markSessionMessageDeliveryUncertain(...args),
        retrySessionMessage: (...args) => this.retrySessionMessage(...args),
        recordSessionDeliveryReceipt: (...args) => this.recordSessionDeliveryReceipt(...args)
      })
    });
    const port = createAgentSessionPort(agentSessionStore);
    this.attachAgentSessionDomainPort(port);
    this.attachAgentSessionLifecycleParticipant(createAgentSessionLifecycleParticipant(agentSessionStore));
    Object.defineProperty(this, 'agentSessions', {
      value: createAgentSessionApi(port),
      enumerable: true,
      configurable: false,
      writable: false
    });
  }
}

// Retain legacy import/method paths at the host boundary, not on WorkflowStore.
// Wrappers resolve through the validated public API at call time, preserving
// instance overrides used by delivery fault-injection and host integrations.
for (const method of AGENT_SESSION_API_METHODS) {
  if (Object.hasOwn(RunalithWorkflowStore.prototype, method)) {
    throw new Error(`Agent Session compatibility facade method conflicts with host method: ${method}`);
  }
  Object.defineProperty(RunalithWorkflowStore.prototype, method, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: function agentSessionCompatibilityFacade(...args) {
      return this.agentSessions[method](...args);
    }
  });
}

export function createRunalithWorkflowStore(database) {
  return new RunalithWorkflowStore(database);
}

let defaultWorkflowStore = null;
export function getDefaultWorkflowStore() {
  if (!defaultWorkflowStore) defaultWorkflowStore = createRunalithWorkflowStore();
  return defaultWorkflowStore;
}

// Preserve the legacy singleton API while deferring database initialization
// until the host actually reads a store property or invokes a store method.
const workflowStoreTarget = Object.create(RunalithWorkflowStore.prototype);
export const workflowStore = new Proxy(workflowStoreTarget, {
  get(_target, property) {
    const store = getDefaultWorkflowStore();
    const value = Reflect.get(store, property, store);
    return typeof value === 'function' ? value.bind(store) : value;
  },
  set(_target, property, value) {
    return Reflect.set(getDefaultWorkflowStore(), property, value, getDefaultWorkflowStore());
  },
  has(_target, property) {
    return property in getDefaultWorkflowStore();
  },
  ownKeys() {
    return Reflect.ownKeys(getDefaultWorkflowStore());
  },
  getOwnPropertyDescriptor(_target, property) {
    const descriptor = Reflect.getOwnPropertyDescriptor(getDefaultWorkflowStore(), property);
    return descriptor ? { ...descriptor, configurable: true } : undefined;
  }
});
export { RunalithWorkflowStore as WorkflowStore };
export { WORKFLOW_DB_PATH };
