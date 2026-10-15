import { LIVE_CLOSE_REASONS, type LiveCloseReason, type LiveMessage } from '@ltw/contracts';

/**
 * The live signal's wire format (docs/adr/0033-live-session.md §1): an incremental
 * event-stream parser, the fixed messages it may carry, and the reconnect schedule.
 */
export interface StreamEvent {
  readonly event: string;
  readonly data: string;
}

/** A line longer than this without an end is not the live protocol. */
const MAX_PENDING = 64 * 1024;

export class EventStreamParser {
  #buffer = '';
  #event = '';
  #data: string[] = [];
  #started = false;
  /** The last chunk ended in CR: an LF opening the next one completes that CRLF. */
  #afterCR = false;

  /** True once a line has grown past any message of the protocol: drop the stream. */
  overflowed = false;

  /** Feeds decoded text; returns the events it completed. Frames may split anywhere. */
  push(chunk: string): StreamEvent[] {
    let text = chunk;
    if (this.#afterCR && text.length > 0) {
      if (text.startsWith('\n')) text = text.slice(1);
      this.#afterCR = false;
    }
    if (!this.#started && text.length > 0) {
      this.#started = true;
      if (text.startsWith('\uFEFF')) text = text.slice(1);
    }
    this.#buffer += text;
    const events: StreamEvent[] = [];
    let start = 0;
    for (let index = 0; index < this.#buffer.length; index += 1) {
      const char = this.#buffer[index];
      if (char !== '\n' && char !== '\r') continue;
      const line = this.#buffer.slice(start, index);
      if (char === '\r') {
        if (index + 1 === this.#buffer.length) this.#afterCR = true;
        else if (this.#buffer[index + 1] === '\n') index += 1;
      }
      start = index + 1;
      const event = this.#line(line);
      if (event) events.push(event);
    }
    this.#buffer = this.#buffer.slice(start);
    if (this.#buffer.length > MAX_PENDING) this.overflowed = true;
    return events;
  }

  #line(line: string): StreamEvent | null {
    if (line === '') {
      const event = { event: this.#event || 'message', data: this.#data.join('\n') };
      const dispatch = this.#data.length > 0;
      this.#event = '';
      this.#data = [];
      return dispatch ? event : null;
    }
    // A comment, such as the heartbeat.
    if (line.startsWith(':')) return null;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.#event = value;
    else if (field === 'data') this.#data.push(value);
    return null;
  }
}

const isReason = (value: unknown): value is LiveCloseReason =>
  (LIVE_CLOSE_REASONS as readonly unknown[]).includes(value);

/** The protocol message an event carries; unknown or malformed events are ignored (null). */
export function liveMessage(event: StreamEvent): LiveMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(event.data);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  switch (event.event) {
    case 'ready':
      return { type: 'ready' };
    case 'changed': {
      const seq = 'seq' in data ? data.seq : undefined;
      return typeof seq === 'number' && Number.isSafeInteger(seq) && seq > 0
        ? { type: 'changed', seq }
        : null;
    }
    case 'closed': {
      const reason = 'reason' in data ? data.reason : undefined;
      return isReason(reason) ? { type: 'closed', reason } : null;
    }
    default:
      return null;
  }
}

export const RECONNECT = { firstMs: 1_000, maxMs: 30_000, jitter: 0.2 } as const;

/** The wait before reconnect attempt `attempt` (1, 2, …): 1 s doubling to 30 s, ±20 %. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(RECONNECT.maxMs, RECONNECT.firstMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (1 + RECONNECT.jitter * (2 * random() - 1)));
}
