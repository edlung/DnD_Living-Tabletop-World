/**
 * Public entry point of @ltw/contracts.
 *
 * Serializable contracts shared by server and clients: command shapes,
 * command results, identifiers, world time, perspectives, and
 * perspective-scoped knowledge views. Contracts carry no domain
 * behavior and depend on no other workspace package.
 */
export type { WorkshopAiSubject, CampaignPreparationTraceView } from './ai-gateway/preparation.ts';
export {
  WORKSHOP_COOKIE,
  workshopIdSchema,
  workshopRedeemSchema,
  workshopDraftQuerySchema,
  createWorkshopDraftSchema,
  type CreateWorkshopDraft,
  type WorkshopSessionView,
  type WorkshopDraftView,
  type WorkshopDraftList,
} from './workshop/access.ts';
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
export type { SessionResponse } from './session/views.ts';
export {
  LIVE_CLOSE_REASONS,
  LIVE_FINAL_REASONS,
  type LiveCloseReason,
  type LiveMessage,
  type PresenceEntry,
  type PresenceResponse,
} from './session/live.ts';
export {
  DM_HISTORY_PAGE_SIZE,
  SUBSTITUTION_NOTE_CHARS,
  SUBSTITUTION_REASONS,
  UNDONE_ACTIONS_LIMIT,
  clientCommandIdSchema,
  recordSubstitutionRequestSchema,
  type DmAuthoringEntry,
  type DmHistoryEntry,
  type DmHistoryResponse,
  type DmSubstitutionEntry,
  type DmUndoAvailability,
  type DmUndoBlocker,
  type DmWorldEntry,
  type DmHandEntry,
  MAX_DM_NOTES,
  dmNoteRequestSchema,
  type DmNoteRequest,
  type DmNoteView,
  type DmNotesResponse,
  type RecordSubstitutionRequest,
  type RecordSubstitutionResponse,
  type SubstitutionReason,
  type UndoneActionsResponse,
} from './session/dm.ts';
export * from './session/accounts.ts';
export {
  CREDENTIAL_TOKEN_PATTERN,
  DEFAULT_INVITATION_HOURS,
  INVITATION_STATUSES,
  MAX_INVITATION_HOURS,
  SESSION_COOKIE,
  SESSION_DAYS,
  createInvitationRequestSchema,
  invitationIdSchema,
  redeemRequestSchema,
  type AuthSessionResponse,
  type CreateInvitationRequest,
  type CreatedInvitationResponse,
  type InvitationStatus,
  type InvitationView,
  type MemberView,
  type MembershipResponse,
  type RedeemRequest,
  type RedeemResponse,
  type RevokeInvitationResponse,
  type RevokeMemberResponse,
} from './session/auth.ts';
export { DEFAULT_LANGUAGE, LANGUAGES, languageSchema, type Language } from './language/language.ts';
export type { CharacterSheetResponse } from './rules/character-view.ts';
export type { CharacterDerived } from './rules/character-derived.ts';
export * from './rules/builder.ts';
export type { SurroundingsResponse } from './context/surroundings.ts';
export {
  ABILITIES,
  AMMUNITION_KINDS,
  CLASS_IDS,
  CLASS_ORDERS,
  CONDITIONS,
  CREATURE_SIZES,
  FIGHTING_STYLES,
  HIT_DIE_SIDES,
  MAX_EXHAUSTION,
  SKILLS,
  SKILL_IDS,
  SPELL_IDS,
  WEAPON_IDS,
  WEAPON_MASTERIES,
  characterSheetSchema,
  effectiveMaximum,
  hitPointsSchema,
  sensesSchema,
  speedsSchema,
  type Ability,
  type AmmunitionKind,
  type CharacterSheet,
  type ClassId,
  type ClassOrder,
  type Condition,
  type CreatureSize,
  type FightingStyle,
  type HitDieSides,
  type HitPoints,
  type Skill,
  type SpellId,
  type SpellcastingSource,
  type Senses,
  type Speeds,
  type WeaponId,
  type WeaponMastery,
} from './rules/character-sheet.ts';
export {
  CONTAGION_IDS,
  contagionStateSchema,
  type ContagionId,
  type ContagionState,
} from './rules/contagions.ts';
export {
  hitDieRequestSchema,
  levelUpRequestSchema,
  restEndRequestSchema,
  restRequestSchema,
  type HitDieRequest,
  type LevelUpRequest,
  type RestRequest,
  type RestResponse,
  type RestResult,
  type RestSkipped,
  type RestView,
} from './rules/rest.ts';
export {
  CONTEXT_ACTION_IDS,
  CONTEXT_HINTS,
  CONTEXT_ILLEGAL_REASONS,
  RANKING_STATUSES,
  RELEVANCE_LEVELS,
  type ContextAction,
  type ContextActionCost,
  type ContextSpell,
  type ContextActionId,
  type ContextEntityRef,
  type ContextHint,
  type ContextIllegalReason,
  type ContextRanking,
  type ContextVisibleState,
  type EntityContextResponse,
  type EntityContextView,
  type RankingStatus,
  type Relevance,
} from './context/views.ts';
export {
  MAX_RANKED_ACTIONS,
  relevanceOutputSchema,
  type RelevanceOutput,
} from './ai-gateway/relevance.ts';
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
  type ItemAction,
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
export * from './combat/index.ts';
export {
  AI_CAPABILITIES,
  INTENT_DECLINE_REASONS,
  INTENT_STATUSES,
  commandProposalSchema,
  dmIntentRequestSchema,
  type AiAttemptView,
  type AiCapability,
  type AiTraceView,
  type AttemptBillingView,
  type ChronicleTraceView,
  type AttemptKind,
  type AttemptOutcome,
  type CommandProposal,
  type DmIntentRequest,
  type DmIntentResponse,
  type DmIntentTraceView,
  type IntentDeclineReason,
  type IntentStatus,
  type NpcDialogueTraceView,
  type RelevanceTraceView,
} from './ai-gateway/intents.ts';
export type {
  AccountingAttemptView,
  AiAccountingDiagnosticView,
  AiRequestLifecycle,
} from './ai-gateway/accounting.ts';
export {
  DIALOGUE_STATUSES,
  MAX_DIALOGUE_LINE,
  MAX_NPC_REPLY,
  dialogueIntentSchema,
  npcDialogueRequestSchema,
  npcReplyOutputSchema,
  type DialogueIntent,
  type DialogueStatus,
  type NpcDialogueRequest,
  type NpcDialogueResponse,
  type NpcReply,
  type NpcReplyOutput,
} from './npc/dialogue.ts';
export {
  AUTHORING_ISSUE_CODES,
  AUTHORING_NOTE_CODES,
  AUTHORING_WARNING_CODES,
  CONFIRMABLE_RISK_LEVELS,
  MAX_PROPOSAL_COMMANDS,
  RISK_LEVELS,
  applyAuthoringCommandSchema,
  authoringConfirmationSchema,
  authoringSourceSchema,
  authoringWarningKeySchema,
  proposableCommandSchema,
  proposalCommandsSchema,
  proposalIdSchema,
  proposalRevisionSchema,
  proposalSummarySchema,
  traceIdSchema,
  type AuthoringConfirmation,
  type AuthoringIssueCode,
  type AuthoringNoteCode,
  type AuthoringSource,
  type AuthoringWarningCode,
  type ConfirmableRiskLevel,
  type ProposableCommand,
  type RiskLevel,
} from './authoring/commands.ts';
export {
  PROPOSAL_STATUSES,
  commitProposalRequestSchema,
  createProposalRequestSchema,
  reviseProposalRequestSchema,
  type AuthoringIssue,
  type AuthoringNote,
  type AuthoringPreview,
  type AuthoringProposalResponse,
  type AuthoringProposalView,
  type AuthoringWarning,
  type CommitProposalRequest,
  type CreateProposalRequest,
  type OpenProposalSummary,
  type OpenProposalsResponse,
  type ProposalStatus,
  type ResolutionOption,
  type ReviseProposalRequest,
  type RiskReason,
} from './authoring/views.ts';
export {
  ATTITUDES,
  DEFAULT_ATTITUDE,
  setRelationshipCommandSchema,
  type Attitude,
} from './relationships/commands.ts';
export {
  ASSET_AUDIENCES,
  ASSET_FAILURES,
  ASSET_MEDIA_TYPES,
  ASSET_PURPOSES,
  ASSET_REQUEST_STATUSES,
  ASSET_SETTLING_COMMAND_TYPES,
  ASSET_STATUSES,
  ASSET_VARIANTS,
  ASSET_WORKER_COMMAND_TYPES,
  assetIdSchema,
  assetLabelSchema,
  assetRequestIdSchema,
  contentHashSchema,
  type AssetAudience,
  type AssetFailure,
  type AssetMediaType,
  type AssetPurpose,
  type AssetRequestStatus,
  type AssetStatus,
  type AssetVariant,
} from './assets/commands.ts';
export {
  QUEST_MILESTONE_KINDS,
  milestoneAfter,
  questBookSchema,
  questDefinitionSchema,
  questMilestoneSchema,
  type QuestDefinition,
  type QuestMilestone,
  type QuestMilestoneKind,
} from './quest/definitions.ts';
export type { QuestListResponse, QuestTransitionView, QuestView } from './quest/views.ts';
export {
  CHRONICLE_LIMITS,
  chronicleEntryKeySchema,
  chronicleOutputSchema,
  chronicleParagraphSchema,
  chronicleProseSchema,
  generateChronicleCommandSchema,
  type ChronicleParagraph,
  type ChronicleProse,
} from './chronicle/commands.ts';
export type {
  ChronicleChapterView,
  ChronicleEntryView,
  ChronicleKnowledgeView,
  ChronicleListResponse,
  ChronicleSourceView,
  FlashbackResponse,
  GenerateChronicleRequest,
  GenerateChronicleResponse,
  MemorySuggestionView,
  MemorySuggestionsResponse,
} from './chronicle/views.ts';
export {
  DAY_PHASES,
  WEATHERS,
  setWeatherCommandSchema,
  type DayPhase,
  type Weather,
} from './visual/commands.ts';
export type {
  EntityPresentation,
  EntityPresentationResponse,
  ScenePresentationResponse,
} from './visual/views.ts';
export type {
  AssetLineageResponse,
  AssetRequestView,
  AssetView,
  EntityAssetsResponse,
  PlayerAssetView,
} from './assets/views.ts';
export * from './campaign/index.ts';
export * from './dice/rolls.ts';
export * from './session/lobby.ts';

export {
  EQUIP_SLOTS,
  ITEM_CATEGORIES,
  armorWeight,
  itemCatalogIdSchema,
  ITEM_LOOKS,
  ITEM_RARITIES,
  itemEffectSchema,
  itemEntrySchema,
  itemMagicSchema,
  type EquipSlot,
  type ItemCategory,
  type ItemEffect,
  type ItemEntry,
  type ItemLook,
  type ItemMagic,
  type ItemRarity,
} from './items/schema.ts';
export { ITEM_CATALOG, catalogEntry, isCatalogItemId } from './items/catalog.ts';
export {
  attuneRequestSchema,
  catalogItemIdSchema,
  identifyRequestSchema,
  type IdentifiedResponse,
  giveCatalogItemRequestSchema,
  type AttuneRequest,
  type AttunedResponse,
  type GiveCatalogItemRequest,
  type GivenCatalogItemResponse,
  type ItemCatalogEntryResponse,
  type ItemCatalogListing,
  type ItemCatalogResponse,
} from './items/catalog-api.ts';
export {
  ITEM_PLAYER_COMMAND_TYPES,
  dropItemCommandSchema,
  equipItemCommandSchema,
  giveItemCommandSchema,
  grantItemCommandSchema,
  takeItemCommandSchema,
  unequipItemCommandSchema,
  useItemCommandSchema,
} from './items/commands.ts';
export type { InventoryItem, InventoryResponse, InventoryWeapon } from './items/views.ts';
export * from './play/index.ts';
export * from './srd/index.ts';
