import { z } from 'zod';

import { entityIdSchema, knowledgeIdSchema } from '../kernel/identifiers.ts';
import type { CommandResult, RejectionCode } from '../kernel/results.ts';

/**
 * NPC dialogue (docs/adr/0020-npc-intelligence.md §1, §3). The player picks
 * an intent; the World Engine decides its canonical outcome first, and only
 * then is the NPC's reply phrased from a minimal context. The player's own
 * words are data: they never change an outcome. The reply is never canonical.
 */
export const dialogueIntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('talk') }).strict(),
  z.object({ kind: z.literal('ask'), topicId: entityIdSchema }).strict(),
  z.object({ kind: z.literal('show'), knowledgeId: knowledgeIdSchema }).strict(),
  z.object({ kind: z.literal('insight'), topicId: entityIdSchema }).strict(),
]);
export type DialogueIntent = z.infer<typeof dialogueIntentSchema>;

export const MAX_DIALOGUE_LINE = 500;
export const MAX_NPC_REPLY = 600;

/** `POST /campaigns/:campaignId/npcs/:npcId/dialogue` body. */
export const npcDialogueRequestSchema = z
  .object({
    characterId: entityIdSchema,
    intent: dialogueIntentSchema,
    line: z.string().trim().min(1).max(MAX_DIALOGUE_LINE).optional(),
  })
  .strict();
export type NpcDialogueRequest = z.infer<typeof npcDialogueRequestSchema>;

/** The structured output every `npc-dialogue` provider must return. */
export const npcReplyOutputSchema = z
  .object({ reply: z.string().trim().min(1).max(MAX_NPC_REPLY) })
  .strict();
export type NpcReplyOutput = z.infer<typeof npcReplyOutputSchema>;

export const DIALOGUE_STATUSES = ['REPLIED', 'INVALID_OUTPUT', 'AI_UNAVAILABLE'] as const;
export type DialogueStatus = (typeof DIALOGUE_STATUSES)[number];

/** The NPC's words: prose for the table, never a fact (invariant 7). */
export interface NpcReply {
  /** Null when no durable request start was confirmed (docs/adr/0032-live-ai.md, B2). */
  readonly traceId: string | null;
  readonly status: DialogueStatus;
  /** Present only when the output passed validation. */
  readonly text: string | null;
  readonly canonical: false;
}

export interface NpcDialogueResponse {
  /** The World Engine's result for the intent's command, as the caller may see it; null for Talk. */
  readonly command: CommandResult | null;
  /** Why the character cannot talk to the NPC now; then there is no reply and no command ran. */
  readonly refused: RejectionCode | null;
  readonly reply: NpcReply | null;
}
