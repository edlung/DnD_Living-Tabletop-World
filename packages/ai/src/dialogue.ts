import {
  npcReplyOutputSchema,
  type AiTraceView,
  type DialogueIntent,
  type Language,
  type NpcReply,
} from '@ltw/contracts';
import { dialogueSourceIds, type Actor, type NpcDialogueContext } from '@ltw/domain';

import { dialoguePrompt, dialogueRequest } from './dialogue-prompt.ts';
import { runWithFallback, type OutputCheck } from './fallback.ts';
import type { IntentDeps } from './intent.ts';

/**
 * An NPC's reply (docs/adr/0020-npc-intelligence.md §3). The caller has
 * already run the intent's command and built the NPC's minimal context from
 * the state after it; this phrases the reply from that context alone, under
 * the owner's fallback policy, and traces it. The reply is never canonical,
 * and this function has no path to the World Engine.
 */
export type DialogueDeps = IntentDeps;

export interface DialogueInput {
  readonly campaignId: string;
  readonly actor: Actor;
  readonly context: NpcDialogueContext;
  readonly intent: DialogueIntent;
  /** Whether the World Engine accepted the intent's command; true for Talk. */
  readonly accepted: boolean;
  /** The canonical command decided before the reply; null for Talk. */
  readonly commandId: string | null;
  /** The player's own words, if any. */
  readonly line: string | null;
  /** The campaign's play language (ADR 0031); English when absent. */
  readonly language?: Language;
}

const CAPABILITY = 'npc-dialogue';
const MAX_ISSUES = 20;

export function validateReply(output: unknown): OutputCheck<string> {
  const parsed = npcReplyOutputSchema.safeParse(output);
  return parsed.success
    ? { ok: true, value: parsed.data.reply }
    : {
        ok: false,
        issues: parsed.error.issues
          .slice(0, MAX_ISSUES)
          .map((issue) => `${issue.path.join('.') || '(output)'}: ${issue.message}`),
      };
}

export async function replyAsNpc(deps: DialogueDeps, input: DialogueInput): Promise<NpcReply> {
  const prompt = dialoguePrompt(input.context, {
    intent: input.intent.kind,
    accepted: input.accepted,
    line: input.line,
    ...(input.language ? { language: input.language } : {}),
  });
  const result = await runWithFallback({
    providers: deps.router.providersFor(CAPABILITY),
    build: (repair) => dialogueRequest(prompt, repair),
    validate: validateReply,
    nowMs: deps.clock.nowMs,
  });

  const reply: NpcReply = {
    traceId: deps.ids.next(),
    status: result.status === 'VALID' ? 'REPLIED' : result.status,
    text: result.status === 'VALID' ? result.value : null,
    canonical: false,
  };
  const trace: AiTraceView = {
    traceId: reply.traceId,
    campaignId: input.campaignId,
    actorId: input.actor.actorId,
    purpose: 'npc-dialogue',
    capability: CAPABILITY,
    scope: `NPC:${input.context.npc.entityId}`,
    sourceIds: dialogueSourceIds(input.context),
    input: input.line ?? '',
    attempts: result.attempts,
    status: reply.status,
    intent: input.intent,
    commandId: input.commandId,
    reply: reply.text,
    issues: result.status === 'INVALID_OUTPUT' ? result.issues : [],
    canonicalEvents: [],
    createdAt: deps.clock.now(),
  };
  await deps.traces.append(trace);
  return reply;
}
