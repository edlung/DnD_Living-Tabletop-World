/**
 * Public entry point of @ltw/contracts.
 *
 * Serializable contracts shared by server and clients: command shapes,
 * command results, identifiers, world time, perspectives, and
 * perspective-scoped knowledge views. Contracts carry no domain
 * behavior and depend on no other workspace package.
 */
export {
  OBJECT_ID_PATTERN,
  actorIdSchema,
  campaignIdSchema,
  commandIdSchema,
  entityIdSchema,
  knowledgeIdSchema,
  sceneIdSchema,
} from './kernel/identifiers.ts';
export {
  MAX_ABS_WORLD_TIME,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
  worldDurationSchema,
  worldTimeSchema,
} from './kernel/world-time.ts';
export {
  ENTITY_KINDS,
  ENTITY_STATUSES,
  KERNEL_COMMAND_TYPES,
  LOCATION_TYPES,
  kernelCommandSchema,
  kernelCommandTypeSchema,
  type EntityKind,
  type EntityStatus,
  type KernelCommand,
  type KernelCommandOf,
  type KernelCommandType,
  type LocationType,
} from './kernel/commands.ts';
export {
  REJECTION_CODES,
  type CommandAccepted,
  type CommandRejected,
  type CommandResult,
  type EventSummary,
  type RejectionCode,
} from './kernel/results.ts';
export {
  KNOWLEDGE_RELATION_TYPES,
  KNOWLEDGE_TYPES,
  knowledgeRelationSchema,
  knowledgeScopeSchema,
  type KnowledgeRelation,
  type KnowledgeRelationType,
  type KnowledgeScope,
  type KnowledgeType,
} from './knowledge/commands.ts';
export {
  formatPerspective,
  parsePerspective,
  type PerspectiveRequest,
} from './knowledge/perspectives.ts';
export {
  API_ERROR_CODES,
  type ApiErrorCode,
  type ApiErrorResponse,
  type EntityKnowledgeResponse,
  type EntityRef,
  type KnowledgeEdge,
  type KnowledgeListResponse,
  type KnowledgeOrigin,
  type KnowledgeRecordResponse,
  type KnowledgeView,
  type KnownEntitiesResponse,
  type RelatedKnowledgeResponse,
} from './knowledge/views.ts';
