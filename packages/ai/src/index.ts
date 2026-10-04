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
  type ProviderErrorCode,
  type ProviderRequest,
  type ProviderResponse,
  type RepairNote,
  type StructuredOutputSpec,
} from './providers.ts';
export { CapabilityRouter } from './router.ts';
export { InMemoryAiTraceStore, type AiTraceStore } from './traces.ts';
export { validateProposal, type ProposalCheck } from './validation.ts';
