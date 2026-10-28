import {
  npcReplyOutputSchema,
  type AiTraceView,
  type DialogueIntent,
  type Language,
  type NpcReply,
  type RejectionCode,
} from '@ltw/contracts';
import { dialogueSourceIds, type Actor, type NpcDialogueContext } from '@ltw/domain';

import { dialoguePrompt, dialogueRequest } from './dialogue-prompt.ts';
import type { OutputCheck } from './fallback.ts';
import type { IntentDeps } from './intent.ts';
import { runAiRequest } from './request.ts';

/**
 * An NPC's reply (docs/adr/0020-npc-intelligence.md §3). The caller has
 * already run the intent's command and built the NPC's minimal context from
 * the state after it; this phrases the reply from that context alone, under
 * the owner's fallback policy, and traces it. The reply is never canonical,
 * and this function has no path to the World Engine. Its whole-request deadline starts here, after
 * the canonical command (docs/adr/0032-live-ai.md, B2): the World Engine's time is not charged to
 * the AI. Without a durable start the reply is AI_UNAVAILABLE with no trace ID; the command's
 * result stands either way.
 */
export type DialogueDeps = IntentDeps;

export interface DialogueInput {
  readonly campaignId: string;
  readonly actor: Actor;
  readonly context: NpcDialogueContext;
  readonly intent: DialogueIntent;
  /** Whether the World Engine accepted the intent's command; true for Talk. */
  readonly accepted: boolean;
  /** The command's rejection code, when it was rejected. */
  readonly rejection?: RejectionCode | null;
  /** The canonical command decided before the reply; null for Talk. */
  readonly commandId: string | null;
  /** The player's own words, if any. */
  readonly line: string | null;
  /** The campaign's play language (ADR 0031); English when absent. */
  readonly language?: Language;
  /**
   * The play session captured by the route from its authorized snapshot before the command ran;
   * null means local only. Trusted accounting metadata: never prompt content, never re-read.
   */
  readonly accountingSessionId: string | null;
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
    rejection: input.rejection ?? null,
    line: input.line,
    ...(input.language ? { language: input.language } : {}),
  });
  const scope = `NPC:${input.context.npc.entityId}`;
  const sourceIds = dialogueSourceIds(input.context);
  return runAiRequest(
    { traces: deps.traces, ids: deps.ids, nowMs: deps.clock.nowMs },
    {
      timeoutMs: deps.requestTimeoutMs,
      start: {
        campaignId: input.campaignId,
        actorId: input.actor.actorId,
        purpose: 'npc-dialogue',
        capability: CAPABILITY,
        scope,
        sourceIds,
        sessionId: input.accountingSessionId,
      },
      providers: deps.router.providersFor(CAPABILITY),
      fallback: { build: (repair) => dialogueRequest(prompt, repair), validate: validateReply },
      noStart: (): NpcReply => ({
        traceId: null,
        status: 'AI_UNAVAILABLE',
        text: null,
        canonical: false,
      }),
      freeze: (result, traceId) => {
        const reply: NpcReply = {
          traceId,
          status: result.status === 'VALID' ? 'REPLIED' : result.status,
          text: result.status === 'VALID' ? result.value : null,
          canonical: false,
        };
        const trace: AiTraceView = {
          traceId,
          campaignId: input.campaignId,
          actorId: input.actor.actorId,
          purpose: 'npc-dialogue',
          capability: CAPABILITY,
          scope,
          sourceIds,
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
        return { response: reply, trace };
      },
    },
  );
}
