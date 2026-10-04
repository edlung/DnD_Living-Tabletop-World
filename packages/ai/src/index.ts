/**
 * Public entry point of @ltw/ai: the AI gateway (docs/adr/0017-ai-gateway.md).
 * Pure: no I/O, no provider SDKs, no path to the World Engine. Providers with
 * I/O and trace persistence live in the server. Map: ../AGENTS.md.
 */
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
  runWithFallback,
  type FallbackDeps,
  type FallbackResult,
  type OutputCheck,
} from './fallback.ts';
export {
  interpretDmIntent,
  type IntentDeps,
  type IntentInput,
  type IntentOutcome,
} from './intent.ts';
export { replyLocally } from './local-dialogue.ts';
export { LOCAL_MODEL, createLocalProvider, interpretLocally } from './local-provider.ts';
export { PROPOSAL_OUTPUT, intentRequest } from './prompt.ts';
export {
  PROVIDER_ERROR_CODES,
  ProviderError,
  failureCode,
  type AiProvider,
  type DialogueTask,
  type IntentTask,
  type RelevanceTask,
  type ProviderErrorCode,
  type ProviderRequest,
  type ProviderResponse,
  type RepairNote,
  type StructuredOutputSpec,
} from './providers.ts';
export { CapabilityRouter } from './router.ts';
export { InMemoryAiTraceStore, type AiTraceStore } from './traces.ts';
export { validateProposal, type ProposalCheck } from './validation.ts';
export {
  ImageGenerationError,
  imageFailureCode,
  type GeneratedImage,
  type ImageBrief,
  type ImageGenerator,
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
