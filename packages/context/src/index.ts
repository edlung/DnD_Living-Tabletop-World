/**
 * Public entry point of @ltw/context: the Context Engine
 * (docs/adr/0012-context-engine.md). Pure composition of domain state,
 * the knowledge and memory boundaries, and the Rules Engine. Rules decide
 * legality (ARCHITECTURE_INVARIANTS.md #9); relevance is a deterministic
 * heuristic over the acting perspective's own data. No AI, no I/O.
 */
export { entityContext, type EntityContextResult } from './entity-context.ts';
export { MAX_TOPICS } from './topics.ts';
