import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * Table talk (docs/adr/0044-online-play.md §1): the table's chat, a whisper to the DM, and the DM's
 * word to one player — table talk beside the world, never world knowledge. A player speaks as
 * their character (in character) or as themselves; the DM as the DM. The client weaves the
 * table's rolls into the log.
 */
export const CHAT_CHANNELS = ['table', 'dm', 'player'] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];
export const CHAT_VOICES = ['in-character', 'out-of-character'] as const;
export type ChatVoice = (typeof CHAT_VOICES)[number];
export const CHAT_TEXT_MAX = 1000;
/** The latest messages a read returns. */
export const CHAT_PAGE = 200;

/** `POST /campaigns/:campaignId/chat?perspective=…`. */
export const chatMessageRequestSchema = z
  .object({
    /** `table`: everyone; `dm`: a player's whisper to the DM; `player`: the DM to one player. */
    channel: z.enum(CHAT_CHANNELS),
    voice: z.enum(CHAT_VOICES),
    text: z.string().trim().min(1).max(CHAT_TEXT_MAX),
    /** The character whose player the DM speaks to (`player` only). */
    recipientId: entityIdSchema.optional(),
  })
  .strict();
export type ChatMessageRequest = z.infer<typeof chatMessageRequestSchema>;

export interface ChatMessageView {
  readonly messageId: string;
  readonly channel: ChatChannel;
  readonly voice: ChatVoice;
  /** The speaking character as this perspective knows it; null is the DM. */
  readonly speaker: { readonly entityId: string; readonly name: string | null } | null;
  /** The character a `player` message goes to (as known), or null. */
  readonly recipient: { readonly entityId: string; readonly name: string | null } | null;
  readonly text: string;
  readonly at: string;
}

/** `GET /campaigns/:campaignId/chat?perspective=…`: what this perspective may read, oldest first. */
export interface ChatLogResponse {
  readonly perspective: string;
  readonly messages: readonly ChatMessageView[];
}
