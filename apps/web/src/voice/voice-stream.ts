import {
  VOICE_CLOSE_REASONS,
  type VoiceCloseReason,
  type VoiceRoom,
  type VoiceSignalFrom,
} from '@ltw/contracts';

import { EventStreamParser, backoffDelay, type StreamEvent } from '../api/live-protocol.ts';

/** What the room's stream says (docs/adr/0060-voice.md §2, §7). */
export type VoiceEvent =
  | { readonly kind: 'room'; readonly room: VoiceRoom }
  | { readonly kind: 'signal'; readonly signal: VoiceSignalFrom }
  /** The room closed this screen's stream for good. */
  | { readonly kind: 'closed'; readonly reason: VoiceCloseReason }
  /** The server would not open it (not online, not a speaker): the status. */
  | { readonly kind: 'refused'; readonly status: number }
  /** The connection dropped: it opens again by itself. */
  | { readonly kind: 'lost' };

const isReason = (value: unknown): value is VoiceCloseReason =>
  (VOICE_CLOSE_REASONS as readonly unknown[]).includes(value);

/** The room's message an event carries; anything else is ignored (null). */
export function voiceEvent(event: StreamEvent): VoiceEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(event.data);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  switch (event.event) {
    case 'room':
      return 'you' in data && 'peers' in data && Array.isArray(data.peers)
        ? { kind: 'room', room: data as VoiceRoom }
        : null;
    case 'signal':
      return 'from' in data && 'kind' in data
        ? { kind: 'signal', signal: data as VoiceSignalFrom }
        : null;
    case 'closed': {
      const reason = 'reason' in data ? data.reason : undefined;
      return isReason(reason) ? { kind: 'closed', reason } : null;
    }
    default:
      return null;
  }
}

/**
 * Reads the campaign's voice stream (`open` asks for it with the screen's credential, never in the
 * URL); a dropped stream opens again after a growing pause, until the room closes it or the screen
 * leaves (the returned call).
 */
export function openVoiceStream(
  open: (signal: AbortSignal) => Promise<Response>,
  onEvent: (event: VoiceEvent) => void,
): () => void {
  let reading = true;
  let attempt = 0;
  let controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const read = async () => {
    controller = new AbortController();
    let final = false;
    try {
      const response = await open(controller.signal);
      if (!response.ok || !response.body) {
        final = true;
        onEvent({ kind: 'refused', status: response.status });
        return;
      }
      attempt = 0;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new EventStreamParser();
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done || !reading) break;
        for (const raw of parser.push(decoder.decode(chunk.value, { stream: true }))) {
          const event = voiceEvent(raw);
          if (!event) continue;
          if (event.kind === 'closed') final = true;
          onEvent(event);
        }
        if (final || parser.overflowed) break;
      }
      await reader.cancel().catch(() => undefined);
    } catch {
      // A dropped connection or our own leaving.
    } finally {
      if (reading && !final) {
        onEvent({ kind: 'lost' });
        attempt += 1;
        timer = setTimeout(() => void read(), backoffDelay(attempt));
      }
    }
  };
  void read();
  return () => {
    reading = false;
    if (timer !== null) clearTimeout(timer);
    controller.abort();
  };
}
