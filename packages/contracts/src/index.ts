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
export {
  MEMORY_KINDS,
  memoryIdSchema,
  memoryScopeSchema,
  sessionIdSchema,
  type MemoryKind,
  type MemoryScope,
} from './memory/commands.ts';
export type {
  MemoryRecallResponse,
  MemoryRecordResponse,
  MemoryView,
  RecalledMemory,
  SessionListResponse,
  SessionView,
} from './memory/views.ts';
export {
  ABILITIES,
  CLASS_IDS,
  CONDITIONS,
  SKILLS,
  SPELL_IDS,
  WEAPON_IDS,
  characterSheetSchema,
  type Ability,
  type CharacterSheet,
  type ClassId,
  type Condition,
  type Skill,
  type SpellId,
  type SpellcastingSource,
  type WeaponId,
} from './rules/character-sheet.ts';
export {
  CONTEXT_ACTION_IDS,
  CONTEXT_HINTS,
  CONTEXT_ILLEGAL_REASONS,
  RELEVANCE_LEVELS,
  type ContextAction,
  type ContextActionCost,
  type ContextActionId,
  type ContextEntityRef,
  type ContextHint,
  type ContextIllegalReason,
  type ContextVisibleState,
  type EntityContextResponse,
  type EntityContextView,
  type Relevance,
} from './context/views.ts';
export {
  CHECK_METHODS,
  CLUE_METHODS,
  DISCLOSURES,
  EXAMINE_METHODS,
  PLAYER_COMMAND_TYPES,
  clueIdSchema,
  type ClueMethod,
  type Disclosure,
  type ExamineMethod,
  type PlayerCommandType,
  type PlayerOutcome,
} from './investigation/commands.ts';
export {
  CLAIM_SLUG_PATTERN,
  claimTargetSchema,
  knowledgeClaimSchema,
  type ClaimTarget,
  type KnowledgeClaim,
} from './knowledge/claims.ts';
export {
  COMBAT_COMMAND_TYPES,
  COVER_LEVELS,
  MAX_BATTLEFIELD,
  MAX_COMBATANTS,
  PLAYER_COMBAT_COMMAND_TYPES,
  SIDES,
  battlefieldSchema,
  squareSchema,
  type Battlefield,
  type CombatCommandType,
  type CoverLevel,
  type Side,
  type Square,
} from './combat/commands.ts';
export {
  damageSchema,
  monsterAttackSchema,
  monsterSpellSchema,
  statBlockSchema,
  type Damage,
  type MonsterAttack,
  type MonsterSpell,
  type StatBlock,
} from './combat/stat-block.ts';
export {
  REACTION_COMMAND_TYPES,
  REACTION_IDS,
  REACTION_RESPONSES,
  REACTION_WINDOW_STATUSES,
  SPELL_COMPONENTS,
  closeReactionWindowCommandSchema,
  declineReactionCommandSchema,
  useReactionCommandSchema,
  type ReactionCommandType,
  type ReactionId,
  type ReactionResponse,
  type ReactionWindowStatus,
  type SpellComponent,
} from './combat/reactions.ts';
export type {
  EncounterCombatantView,
  EncounterResponse,
  EncounterView,
  ReactionWindowView,
} from './combat/views.ts';
