import { z } from 'zod';

/**
 * Voice at the table (docs/adr/0060-voice.md): a room per campaign while a session plays online,
 * eight speakers at most, peer to peer. The server only introduces the screens to each other: it
 * relays their offers, answers and candidates, and keeps who is in the room and whom the DM muted.
 * A speaker is known in the room by an opaque peer ID of its own, never by its account.
 */
export const MAX_SPEAKERS = 8;

export interface VoicePeer {
  readonly peerId: string;
  /** The speaker's character, as the room knows it; null for the DM. */
  readonly name: string | null;
  readonly dm: boolean;
  /** Muted by the DM: heard by nobody until the DM lets them talk again. */
  readonly muted: boolean;
}

/** `event: room` on the voice stream: who is in the room, and which of them this screen is. */
export interface VoiceRoom {
  readonly you: string;
  readonly peers: readonly VoicePeer[];
}

const sdpSchema = z.string().min(1).max(20_000);

/** `POST …/voice/signal`: one message for one other speaker in the room. */
export const voiceSignalSchema = z.discriminatedUnion('kind', [
  z.object({ to: z.uuid(), kind: z.literal('offer'), sdp: sdpSchema }).strict(),
  z.object({ to: z.uuid(), kind: z.literal('answer'), sdp: sdpSchema }).strict(),
  z
    .object({
      to: z.uuid(),
      kind: z.literal('candidate'),
      candidate: z.string().max(2_000),
      sdpMid: z.string().max(64).nullable(),
      sdpMLineIndex: z.number().int().min(0).max(64).nullable(),
    })
    .strict(),
]);
export type VoiceSignal = z.infer<typeof voiceSignalSchema>;

/** Each kind of a union without one field (`Omit` would keep only the fields they share). */
type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** `event: signal` on the voice stream: a message from another speaker. */
export type VoiceSignalFrom = Without<VoiceSignal, 'to'> & { readonly from: string };

/** Why the room closed this screen's stream. */
export const VOICE_CLOSE_REASONS = ['removed', 'ended', 'full', 'replaced'] as const;
export type VoiceCloseReason = (typeof VOICE_CLOSE_REASONS)[number];

/** `POST …/voice/mute` (DM): a speaker muted for everyone, or let talk again. */
export const voiceMuteSchema = z.object({ peerId: z.uuid(), muted: z.boolean() }).strict();

/** `POST …/voice/remove` (DM): a speaker out of the room. */
export const voiceRemoveSchema = z.object({ peerId: z.uuid() }).strict();

/** `GET …/voice/ice`: where the screens meet — a relay's short-lived credentials, if one is set. */
export interface VoiceIceResponse {
  readonly iceServers: readonly {
    readonly urls: readonly string[];
    readonly username?: string;
    readonly credential?: string;
  }[];
}
