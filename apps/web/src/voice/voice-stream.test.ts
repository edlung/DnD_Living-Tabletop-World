import { describe, expect, it } from 'vitest';

import { voiceEvent } from './voice-stream.ts';

/**
 * The voice room's stream as a screen reads it (docs/adr/0060-voice.md §2): who is in the room,
 * another speaker's signal, the room closing this screen's stream; anything else is ignored.
 */
describe('the voice stream’s events', () => {
  it('reads the room, a signal and a close, and nothing else', () => {
    const room = { you: 'a', peers: [{ peerId: 'a', name: null, dm: true, muted: false }] };
    expect(voiceEvent({ event: 'room', data: JSON.stringify(room) })).toEqual({
      kind: 'room',
      room,
    });
    const signal = { kind: 'offer', sdp: 'v=0', from: 'b' };
    expect(voiceEvent({ event: 'signal', data: JSON.stringify(signal) })).toEqual({
      kind: 'signal',
      signal,
    });
    expect(voiceEvent({ event: 'closed', data: '{"reason":"removed"}' })).toEqual({
      kind: 'closed',
      reason: 'removed',
    });
    expect(voiceEvent({ event: 'closed', data: '{"reason":"bored"}' })).toBeNull();
    expect(voiceEvent({ event: 'room', data: '{"you":"a"}' })).toBeNull();
    expect(voiceEvent({ event: 'changed', data: '{"seq":1}' })).toBeNull();
    expect(voiceEvent({ event: 'room', data: 'not json' })).toBeNull();
  });
});
