import { describe, expect, it } from 'vitest';

import { backoffDelay, EventStreamParser, liveMessage, RECONNECT } from './live-protocol.ts';

/** The live signal's wire format, read incrementally (docs/adr/0033-live-session.md §1). */
const STREAM =
  'event: ready\ndata: {}\n\n: heartbeat\n\nevent: changed\ndata: {"seq":1}\n\n' +
  'event: closed\ndata: {"reason":"gone"}\n\n';
const EXPECTED = [
  { event: 'ready', data: '{}' },
  { event: 'changed', data: '{"seq":1}' },
  { event: 'closed', data: '{"reason":"gone"}' },
];

describe('the event-stream parser', () => {
  it('reads whole frames and skips comment heartbeats', () => {
    expect(new EventStreamParser().push(STREAM)).toEqual(EXPECTED);
  });

  it('reads the same events however the bytes are split', () => {
    for (const text of [STREAM, STREAM.replaceAll('\n', '\r\n'), STREAM.replaceAll('\n', '\r')]) {
      for (let cut = 0; cut <= text.length; cut += 1) {
        const parser = new EventStreamParser();
        const events = [...parser.push(text.slice(0, cut)), ...parser.push(text.slice(cut))];
        expect(events, `${JSON.stringify(text)} split at ${String(cut)}`).toEqual(EXPECTED);
      }
      const parser = new EventStreamParser();
      const chars = Array.from({ length: text.length }, (_unused, index) => text.charAt(index));
      expect(chars.flatMap((char) => parser.push(char))).toEqual(EXPECTED);
    }
  });

  it('keeps an unfinished frame until it ends', () => {
    const parser = new EventStreamParser();
    expect(parser.push('event: changed\ndata: {"seq":2}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ event: 'changed', data: '{"seq":2}' }]);
  });

  it('ignores unknown fields, joins data lines, strips a byte-order mark and one space', () => {
    const parser = new EventStreamParser();
    expect(
      parser.push('﻿id: 7\nretry: 10\nevent:changed\ndata:{"seq":\ndata: 3}\nfoo\n\n'),
    ).toEqual([{ event: 'changed', data: '{"seq":\n3}' }]);
    // A frame without data is not an event.
    expect(parser.push('event: ready\n\n')).toEqual([]);
  });

  it('flags a line longer than any message of the protocol', () => {
    const parser = new EventStreamParser();
    parser.push(`data: ${'x'.repeat(70_000)}`);
    expect(parser.overflowed).toBe(true);
  });
});

describe('live messages', () => {
  it('accepts exactly the fixed messages', () => {
    expect(liveMessage({ event: 'ready', data: '{}' })).toEqual({ type: 'ready' });
    expect(liveMessage({ event: 'changed', data: '{"seq":4}' })).toEqual({
      type: 'changed',
      seq: 4,
    });
    for (const reason of ['unauthenticated', 'forbidden', 'gone', 'overloaded', 'shutdown']) {
      expect(liveMessage({ event: 'closed', data: JSON.stringify({ reason }) })).toEqual({
        type: 'closed',
        reason,
      });
    }
  });

  it('ignores unknown events and malformed data', () => {
    for (const event of [
      { event: 'message', data: '{}' },
      { event: 'world', data: '{"entities":[]}' },
      { event: 'ready', data: 'not json' },
      { event: 'ready', data: 'null' },
      { event: 'changed', data: '{"seq":0}' },
      { event: 'changed', data: '{"seq":1.5}' },
      { event: 'changed', data: '{"seq":"2"}' },
      { event: 'closed', data: '{"reason":"bye"}' },
      { event: 'closed', data: '{}' },
    ]) {
      expect(liveMessage(event), JSON.stringify(event)).toBeNull();
    }
  });
});

describe('the reconnect schedule', () => {
  it('starts at 1 s, doubles to 30 s, and stays within ±20 %', () => {
    const bases = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000];
    for (const [index, base] of bases.entries()) {
      const attempt = index + 1;
      expect(backoffDelay(attempt, () => 0.5)).toBe(base);
      expect(backoffDelay(attempt, () => 0)).toBe(Math.round(base * 0.8));
      expect(backoffDelay(attempt, () => 0.999_999)).toBeLessThanOrEqual(base * 1.2);
      for (let sample = 0; sample < 50; sample += 1) {
        const delay = backoffDelay(attempt);
        expect(delay).toBeGreaterThanOrEqual(base * (1 - RECONNECT.jitter));
        expect(delay).toBeLessThanOrEqual(base * (1 + RECONNECT.jitter));
      }
    }
  });
});
