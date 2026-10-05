/**
 * Public entry point of @ltw/domain.
 *
 * World Kernel (Stage 10): canonical state, commands, events, the World
 * Engine, and projections. Knowledge boundary (Stage 20): knowledge records,
 * perspective resolution, and perspective-scoped queries. Domain code is
 * pure: no I/O, no persistence drivers, no AI providers. Canonical mutation
 * happens only through `WorldEngine.execute` (ARCHITECTURE_INVARIANTS.md #1).
 * Authoring (Stage 110): confirmed proposals applied as one command
 * (`ApplyAuthoring`) and previewed with `previewAuthoring`.
 * Maps: src/kernel/AGENTS.md, src/knowledge/AGENTS.md, src/authoring/AGENTS.md.
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
export { schemaVersionOf, writtenEarlier } from './kernel/event-versions.ts';
export {
  kernelEventSchema,
  parseRecordedEvent,
  type KernelEvent,
  type KernelEventOf,
  type KernelEventType,
  type RecordedEvent,
  type Restore,
} from './kernel/events.ts';
export { CorruptHistoryError, evolve, replay } from './kernel/evolve.ts';
export { facts, type FactKey } from './kernel/fact-keys.ts';
export { footprintOf, type Footprint } from './kernel/facts.ts';
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
export { controlledCharacter, holderPerspective } from './knowledge/perspective.ts';
export { campaignSession } from './knowledge/session.ts';
export { characterSheetView } from './character/view.ts';
export { knownEntityIds, visibleRecords } from './knowledge/projection.ts';
export type { MemoryRecord, SessionRecord } from './memory/records.ts';
export {
  DEFAULT_RECALL_LIMIT,
  MAX_RECALL_LIMIT,
  getMemory,
  listSessions,
  recallMemories,
  visibleMemories,
  type RecallQuery,
  type RecallResult,
} from './memory/retrieval.ts';
export { placementAt } from './kernel/projections/world-view.ts';
export { perceivedEntityIds } from './investigation/perception.ts';
export { checkTalk, type TalkCheck } from './npc/talk.ts';
export {
  DIALOGUE_LIMITS,
  dialogueSourceIds,
  npcDialogueContext,
  sharedSources,
  type DialogueContextRequest,
  type DialogueEntity,
  type DialogueLine,
  type NpcDialogueContext,
} from './npc/dialogue-context.ts';
export { attemptKey, insightKey, shownKey, type Clue } from './investigation/records.ts';
export type { SkillCheckPort } from './investigation/skill-checks.ts';
export {
  ENTROPY_POOL,
  entropyFor,
  poolDice,
  type CombatCommand,
  type CombatPort,
  type Dice,
  type EntropySource,
} from './combat/port.ts';
export {
  FRESH_TURN,
  combatantOf,
  currentCombatant,
  encounterAfterTurnStart,
  isCombatant,
  type CombatantRecord,
  type EncounterState,
  type TurnRecord,
} from './combat/records.ts';
export {
  REACTION_WINDOW_ID_INDEX,
  consideredCombatants,
  openReactionWindow,
  pendingCandidates,
  type ReactionTrigger,
  type ReactionWindowRecord,
} from './combat/reactions.ts';
export { foldDrafts } from './kernel/provisional.ts';
export { pausedCombat } from './kernel/decide/reaction-pause.ts';
export type { DecisionContext, Decision, Resolution } from './kernel/decision.ts';
export { accept, reject } from './kernel/decision.ts';
export type { KernelEvent as DraftEvent } from './kernel/events.ts';
export { premisesEvent } from './investigation/acting.ts';
export type { Premise, RecordedPremise } from './investigation/events.ts';
export { redecideEffective, type Divergence } from './kernel/verification/redecide.ts';
export { undoneBeneathEarlierWriters } from './kernel/verification/earlier-writers.ts';
export { magicDiscoveryEvents, magicSensingPremises } from './investigation/reveal.ts';
export { authoringCommandId, previewAuthoring, type PreviewInput } from './authoring/preview.ts';
export type { ConsentRequirement } from './authoring/consent.ts';
export type { ResolvedProposable } from './kernel/decision.ts';
export {
  assetContentFor,
  assetLineage,
  assetVisibleEntityIds,
  entityAssetsFor,
} from './assets/views.ts';
export {
  assetIdFor,
  type AssetJobRecord,
  type AssetRecord,
  type AssetRequestRecord,
  type AssetState,
} from './assets/records.ts';
export {
  assetContentAt,
  entityPresentationAt,
  scenePresentationAt,
  type Snapshot as VisualSnapshot,
} from './visual/views.ts';
export { dayPhaseAt, visualTimelineAt, type VisualTimeline } from './visual/timeline.ts';
export { chronicleEntries, type ChronicleDraft } from './chronicle/entries.ts';
export { checkProse, templateProse } from './chronicle/prose.ts';
export {
  chronicleText,
  languageOf,
  russianSentence,
  sayIn,
  type ChronicleText,
  type Say,
} from './language/index.ts';
export { HEDGED_TYPES, type StoredEntry as ChronicleEntry } from './chronicle/records.ts';
export { chronicleChapters } from './chronicle/views.ts';
export { memorySuggestions, type SuggestionScope } from './chronicle/suggestions.ts';
export { flashbackFor } from './chronicle/flashback.ts';
export { questFor, questLog } from './quest/projection.ts';
