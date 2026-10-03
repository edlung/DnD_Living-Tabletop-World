/**
 * Public entry point of @ltw/domain.
 *
 * World Kernel (Stage 10): canonical state, commands, events, the World
 * Engine, and projections. Knowledge boundary (Stage 20): knowledge records,
 * perspective resolution, and perspective-scoped queries. Domain code is
 * pure: no I/O, no persistence drivers, no AI providers. Canonical mutation
 * happens only through `WorldEngine.execute` (ARCHITECTURE_INVARIANTS.md #1).
 * Maps: src/kernel/AGENTS.md, src/knowledge/AGENTS.md.
 */
export { actorSchema, type Actor } from './kernel/actor.ts';
export {
  EMPTY_WORLD_STATE,
  PLACEABLE_KINDS,
  STATUSES_BY_KIND,
  type CampaignState,
  type CommandTrace,
  type EntityState,
  type LocationInfo,
  type Placement,
  type SceneState,
  type WorldState,
} from './kernel/state.ts';
export {
  EVENT_SCHEMA_VERSION,
  kernelEventSchema,
  parseRecordedEvent,
  type KernelEvent,
  type KernelEventOf,
  type KernelEventType,
  type RecordedEvent,
  type Restore,
} from './kernel/events.ts';
export { CorruptHistoryError, evolve, replay } from './kernel/evolve.ts';
export { facts, footprintOf, type FactKey, type Footprint } from './kernel/facts.ts';
export type { Rejection, ResolvedCommand } from './kernel/decision.ts';
export type { UndoBlocker } from './kernel/decide/undo.ts';
export { formatWorldTime, worldTimeAt } from './kernel/world-time.ts';

export {
  WorldEngine,
  type CampaignSnapshot,
  type WorldEngineOptions,
} from './kernel/engine/world-engine.ts';
export {
  CommandIdConflictError,
  StreamVersionConflictError,
  type AppendBatch,
  type EventStore,
  type IdGenerator,
  type StoredCommand,
  type StreamSlice,
  type WallClock,
} from './kernel/engine/event-store.ts';
export { InMemoryEventStore } from './kernel/engine/in-memory-event-store.ts';
export { parseStoredCommand } from './kernel/engine/stored-command.ts';
export { SequentialIds, SteppingClock } from './kernel/engine/deterministic-sources.ts';
export {
  commandSubmissionSchema,
  fingerprintOf,
  type CommandSubmission,
} from './kernel/engine/submission.ts';
export { submissionsFromScript } from './kernel/engine/script.ts';

export { auditTrail, type AuditEntry, type AuditFilter } from './kernel/projections/audit-trail.ts';
export {
  worldViewAt,
  type EntityAtTime,
  type SceneAtTime,
  type WorldView,
} from './kernel/projections/world-view.ts';
export { checkWorldIntegrity } from './kernel/projections/integrity.ts';

export { scopeKey, type KnowledgeRecord } from './knowledge/records.ts';
export {
  campaignRole,
  resolvePerspective,
  type CampaignRole,
  type PerspectiveAccess,
  type ResolvedPerspective,
} from './knowledge/perspective.ts';
export {
  entityKnowledge,
  getKnowledge,
  knownEntities,
  listKnowledge,
  relatedKnowledge,
  type KnowledgeFilter,
  type ListResult,
} from './knowledge/queries.ts';
