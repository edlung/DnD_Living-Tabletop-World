import { MAX_SPEAKERS } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import type { LiveSink } from '../live/stream.ts';
import { VoiceRooms } from './voice-rooms.ts';

/**
 * The table's voice room (docs/adr/0060-voice.md §1–2, §6): who is in it, each by a peer ID of
 * their own; signals relayed to one other speaker only; the DM's mute and removal; a full room; a
 * second stream of one account replacing the first.
 */
class Sink implements LiveSink {
  readonly frames: string[] = [];
  ended = false;
  #close: (() => void) | null = null;
  write(text: string) {
    this.frames.push(text);
  }
  unsent() {
    return 0;
  }
  end() {
    this.ended = true;
    this.#close?.();
  }
  destroy() {
    this.end();
  }
  onClose(listener: () => void) {
    this.#close = listener;
  }
  /** The data of every frame of an event, parsed. */
  of(event: string): unknown[] {
    return this.frames
      .filter((text) => text.startsWith(`event: ${event}\n`))
      .map((text) => JSON.parse(text.split('\ndata: ')[1] ?? 'null') as unknown);
  }
}

const speaker = (actorId: string, dm = false) => ({ actorId, name: dm ? null : actorId, dm });

describe('the table’s voice room', () => {
  it('tells everyone who is in it, each by a peer ID of their own', () => {
    const rooms = new VoiceRooms();
    const dm = new Sink();
    const player = new Sink();
    const dmPeer = rooms.join('ravenford', speaker('dm', true), dm);
    const playerPeer = rooms.join('ravenford', speaker('elowen'), player);
    expect(dmPeer).not.toBeNull();
    expect(playerPeer).not.toBeNull();
    expect(player.of('room').at(-1)).toEqual({
      you: playerPeer,
      peers: [
        { peerId: dmPeer, name: null, dm: true, muted: false },
        { peerId: playerPeer, name: 'elowen', dm: false, muted: false },
      ],
    });
    // Nobody's account is in what the room says.
    expect(JSON.stringify(player.of('room'))).not.toContain('actorId');
    player.end();
    expect(dm.of('room').at(-1)).toEqual({
      you: dmPeer,
      peers: [{ peerId: dmPeer, name: null, dm: true, muted: false }],
    });
  });

  it('relays a signal to the one speaker it names, from the sender’s peer ID', () => {
    const rooms = new VoiceRooms();
    const [a, b, c] = [new Sink(), new Sink(), new Sink()];
    const peerA = rooms.join('ravenford', speaker('a'), a) ?? '';
    const peerB = rooms.join('ravenford', speaker('b'), b) ?? '';
    rooms.join('ravenford', speaker('c'), c);
    expect(rooms.signal('ravenford', 'a', { to: peerB, kind: 'offer', sdp: 'v=0' })).toBe('sent');
    expect(b.of('signal')).toEqual([{ kind: 'offer', sdp: 'v=0', from: peerA }]);
    expect(c.of('signal')).toEqual([]);
    // Not to oneself, not to anyone outside the room, not from outside it.
    expect(rooms.signal('ravenford', 'a', { to: peerA, kind: 'answer', sdp: 'v=0' })).toBe(
      'absent',
    );
    expect(rooms.signal('elsewhere', 'a', { to: peerB, kind: 'answer', sdp: 'v=0' })).toBe(
      'absent',
    );
    expect(rooms.signal('ravenford', 'stranger', { to: peerB, kind: 'answer', sdp: 'v=0' })).toBe(
      'absent',
    );
  });

  it('takes the DM’s mute and removal, and ends with the online table', () => {
    const rooms = new VoiceRooms();
    const [dm, player] = [new Sink(), new Sink()];
    rooms.join('ravenford', speaker('dm', true), dm);
    const peer = rooms.join('ravenford', speaker('elowen'), player) ?? '';
    expect(rooms.mute('ravenford', peer, true)).toBe(true);
    expect(dm.of('room').at(-1)).toMatchObject({ peers: [{}, { peerId: peer, muted: true }] });
    expect(rooms.remove('ravenford', peer)).toBe(true);
    expect(player.of('closed')).toEqual([{ reason: 'removed' }]);
    expect(player.ended).toBe(true);
    expect(rooms.peers('ravenford')).toHaveLength(1);
    rooms.end('ravenford');
    expect(dm.of('closed')).toEqual([{ reason: 'ended' }]);
    expect(rooms.peers('ravenford')).toEqual([]);
  });

  it('keeps eight at most, and one stream an account', () => {
    const rooms = new VoiceRooms();
    const first = new Sink();
    rooms.join('ravenford', speaker('p0'), first);
    for (let index = 1; index < MAX_SPEAKERS; index += 1) {
      rooms.join('ravenford', speaker(`p${String(index)}`), new Sink());
    }
    const ninth = new Sink();
    expect(rooms.join('ravenford', speaker('p9'), ninth)).toBeNull();
    expect(ninth.of('closed')).toEqual([{ reason: 'full' }]);
    // The same account again: the older stream goes, the new one takes its place.
    const again = new Sink();
    expect(rooms.join('ravenford', speaker('p0'), again)).not.toBeNull();
    expect(first.of('closed')).toEqual([{ reason: 'replaced' }]);
    expect(rooms.peers('ravenford')).toHaveLength(MAX_SPEAKERS);
  });

  it('stops a speaker that floods the room with signals', () => {
    let now = 0;
    const rooms = new VoiceRooms(() => now);
    rooms.join('ravenford', speaker('a'), new Sink());
    const peerB = rooms.join('ravenford', speaker('b'), new Sink()) ?? '';
    const send = () => rooms.signal('ravenford', 'a', { to: peerB, kind: 'offer', sdp: 'v=0' });
    for (let index = 0; index < 600; index += 1) expect(send()).toBe('sent');
    expect(send()).toBe('limited');
    now = 60_000;
    expect(send()).toBe('sent');
  });
});
