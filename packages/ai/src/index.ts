/**
 * Public entry point of @ltw/ai: the AI gateway (docs/adr/0017-ai-gateway.md).
 * Pure: no I/O, no provider SDKs, no path to the World Engine. Providers with
 * I/O and trace persistence live in the server. Map: ../AGENTS.md.
 */
export {
  runCampaignPreparation,
  type CampaignPreparationInput,
  type CampaignPreparationResult,
} from './preparation.ts';
export {
  buildContext,
  type BuiltContext,
  type ContextItem,
  type ContextSection,
} from './context-builder.ts';
export { replyAsNpc, validateReply, type DialogueDeps, type DialogueInput } from './dialogue.ts';
export {
  REPLY_OUTPUT,
  dialoguePrompt,
  dialogueRequest,
  type DialoguePrompt,
  type Exchange,
} from './dialogue-prompt.ts';
export {
  applyRanking,
  rankContextActions,
  validateRanking,
  type RankedContext,
  type RelevanceDeps,
  type RelevanceInput,
} from './relevance.ts';
export {
  RANKER_LIMITS,
  RANKING_OUTPUT,
  rankerContext,
  relevanceRequest,
  type RankerContext,
  type RelevancePrompt,
} from './relevance-prompt.ts';
export {
  WRONG_OUTPUT_KIND,
  runWithFallback,
  type AttemptProgress,
  type FallbackDeps,
  type FallbackResult,
  type InvalidCode,
  type OutputCheck,
  type UnavailableCode,
} from './fallback.ts';
export {
  interpretDmIntent,
  type IntentDeps,
  type IntentInput,
  type IntentOutcome,
} from './intent.ts';
export { replyLocally } from './local-dialogue.ts';
export {
  LOCAL_MODEL,
  createLocalProvider,
  interpretLocally,
  isLocalProvider,
  type LocalInterpretation,
} from './local-provider.ts';
export { INTENT_OUTPUT, intentRequest } from './prompt.ts';
export {
  DENIAL_CODES,
  MALFORMED_CODES,
  PROVIDER_ERROR_CODES,
  ProviderError,
  SUSPECT_CODES,
  failureCode,
  outputResponse,
  type AdmittedProvider,
  type AttemptCharge,
  type AttemptContext,
  type BillingFacts,
  type DenialCode,
  type DialogueTask,
  type IntentTask,
  type LocalProvider,
  type MalformedCode,
  type ProviderKind,
  type RelevanceTask,
  type ProviderErrorCode,
  type ProviderPayload,
  type ProviderRequest,
  type ProviderResponse,
  type RepairNote,
  type RequestAccounting,
  type ResponseFacts,
  type RoutedProvider,
  type StructuredOutputSpec,
  type SuspectCode,
  type TokenUsage,
} from './providers.ts';
export {
  CapabilityRouter,
  routeShapeIssue,
  snapshotRoutes,
  type RouteSnapshot,
  type Routes,
} from './router.ts';
export {
  InMemoryAiTraceStore,
  OutcomeConflict,
  type AiRequestStart,
  type AiTraceStore,
  type FrozenOutcome,
} from './traces.ts';
export {
  DeadlineConfigError,
  isExpired,
  openDeadline,
  type RequestDeadline,
} from './request-deadline.ts';
export {
  NO_PROPOSAL,
  intentOutputSchema,
  validateIntent,
  validateProposal,
  type ProposalCheck,
} from './validation.ts';
export {
  ImageGenerationError,
  imageFailureCode,
  type GeneratedImage,
  type ImageBrief,
  type ImageGenerator,
  type ImageJob,
} from './images.ts';
export {
  PLACEHOLDER_MODEL,
  createPlaceholderImageGenerator,
  placeholderSvg,
} from './placeholder-images.ts';
export {
  TEMPLATE_MODEL,
  renderChronicle,
  validateChronicle,
  type ChronicleInput,
  type RenderedChronicle,
} from './chronicle.ts';
export {
  CHRONICLE_OUTPUT,
  chroniclePrompt,
  renderChroniclePrompt,
  type ChroniclePrompt,
} from './chronicle-prompt.ts';
