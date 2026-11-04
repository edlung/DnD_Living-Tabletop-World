import { randomUUID } from 'node:crypto';

import {
  MAX_SPEAKERS,
  type VoiceCloseReason,
  type VoiceRoom,
  type VoiceSignal,
  type VoiceSignalFrom,
} from '@ltw/contracts';

import type { LiveSink } from '../live/stream.ts';

/**
 * The table's voice rooms (docs/adr/0060-voice.md §1–2, §6), in this process's memory: who is in a
 * campaign's room, by an opaque peer ID of their own, and whom the DM muted or removed — by the
 * person, so a reload changes neither, until the room ends. The room relays a speaker's signals to
 * one other speaker of the same room and tells everyone who is in it; it never carries sound. A
 * screen that does not read its stream is dropped before its backlog grows; a person's signals are
 * counted across their reconnections. A restart empties every room; the screens join again on their
 * own (§7).
 */
interface Member {
  readonly peerId: string;
  readonly actorId: string;
  readonly name: string | null;
  readonly dm: boolean;
  muted: boolean;
  readonly sink: LiveSink;
}

export interface Speaker {
  readonly actorId: string;
  /** The speaker's character's name; null for the DM. */
  readonly name: string | null;
  readonly dm: boolean;
}

/** A screen sends a few dozen signals to connect; this many a minute is a misbehaving one. */
const SIGNALS_PER_MINUTE = 600;
/** A screen this far behind its stream is not reading it: it is dropped (offers are a few KB). */
const BACKLOG_BYTES = 256 * 1024;
/** Proxies close a quiet stream: a comment every so often keeps it open. */
const HEARTBEAT_MS = 25_000;

const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** Who the DM muted and removed in a campaign's room, by actor, until the room ends. */
interface Decisions {
  readonly muted: Set<string>;
  readonly removed: Set<string>;
}

export class VoiceRooms {
  readonly #rooms = new Map<string, Map<string, Member>>();
  readonly #decisions = new Map<string, Decisions>();
  /** Each person's signals in the current minute, across their streams: `campaign actor`. */
  readonly #counts = new Map<string, { sent: number; since: number }>();
  readonly #now: () => number;
  #heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  /**
   * A speaker joins the campaign's room on this stream: a second stream of the same account (a
   * reload, another tab) replaces the first; a full room closes it at once. The new peer ID, or null.
   */
  join(campaignId: string, speaker: Speaker, sink: LiveSink): string | null {
    const room = this.#rooms.get(campaignId) ?? new Map<string, Member>();
    for (const member of [...room.values()]) {
      if (member.actorId === speaker.actorId) this.#close(campaignId, member, 'replaced');
    }
    const decisions = this.#decisionsOf(campaignId);
    const refused: VoiceCloseReason | null = decisions.removed.has(speaker.actorId)
      ? 'removed'
      : room.size >= MAX_SPEAKERS
        ? 'full'
        : null;
    if (refused !== null) {
      sink.write(frame('closed', { reason: refused }));
      sink.end();
      return null;
    }
    const member: Member = {
      ...speaker,
      peerId: randomUUID(),
      muted: decisions.muted.has(speaker.actorId),
      sink,
    };
    room.set(member.peerId, member);
    this.#rooms.set(campaignId, room);
    sink.onClose(() => {
      this.leave(campaignId, member.peerId);
    });
    this.#beat();
    this.#tell(campaignId);
    return member.peerId;
  }

  /** A speaker's stream ended: they are out of the room. */
  leave(campaignId: string, peerId: string): void {
    const room = this.#rooms.get(campaignId);
    if (!room?.delete(peerId)) return;
    if (room.size === 0) this.#rooms.delete(campaignId);
    this.#tell(campaignId);
    this.#beat();
  }

  /** The speaker an account is in the room as; null when it is not in it. */
  peerOf(campaignId: string, actorId: string): string | null {
    for (const member of this.#rooms.get(campaignId)?.values() ?? []) {
      if (member.actorId === actorId) return member.peerId;
    }
    return null;
  }

  /**
   * One speaker's signal to another of the same room: sent; the sender or the one it names not in
   * the room; or the sender past its minute's signals.
   */
  signal(campaignId: string, actorId: string, signal: VoiceSignal): 'sent' | 'absent' | 'limited' {
    const room = this.#rooms.get(campaignId);
    const from = [...(room?.values() ?? [])].find((member) => member.actorId === actorId);
    const to = room?.get(signal.to);
    if (!from || !to || from === to) return 'absent';
    const now = this.#now();
    const key = `${campaignId} ${actorId}`;
    let count = this.#counts.get(key);
    if (count === undefined || now - count.since >= 60_000) {
      count = { sent: 0, since: now };
      this.#counts.set(key, count);
    }
    count.sent += 1;
    if (count.sent > SIGNALS_PER_MINUTE) return 'limited';
    // What the sender said, from its peer ID, without whom it named.
    const relayed: VoiceSignalFrom =
      signal.kind === 'candidate'
        ? {
            kind: 'candidate',
            candidate: signal.candidate,
            sdpMid: signal.sdpMid,
            sdpMLineIndex: signal.sdpMLineIndex,
            from: from.peerId,
          }
        : signal.kind === 'offer'
          ? { kind: 'offer', sdp: signal.sdp, from: from.peerId }
          : { kind: 'answer', sdp: signal.sdp, from: from.peerId };
    this.#send(campaignId, to, frame('signal', relayed));
    return 'sent';
  }

  /** The DM mutes a speaker for everyone, or lets them talk again; false when not in the room. */
  mute(campaignId: string, peerId: string, muted: boolean): boolean {
    const member = this.#rooms.get(campaignId)?.get(peerId);
    if (!member) return false;
    member.muted = muted;
    const { muted: decided } = this.#decisionsOf(campaignId);
    if (muted) decided.add(member.actorId);
    else decided.delete(member.actorId);
    this.#tell(campaignId);
    return true;
  }

  /** The DM removes a speaker from the room until it ends; false when not in it. */
  remove(campaignId: string, peerId: string): boolean {
    const member = this.#rooms.get(campaignId)?.get(peerId);
    if (!member) return false;
    this.#decisionsOf(campaignId).removed.add(member.actorId);
    this.#close(campaignId, member, 'removed');
    return true;
  }

  /** A speaker who may no longer be in the room (signed out, seat taken away): their stream closes. */
  dismiss(campaignId: string, peerId: string): void {
    const member = this.#rooms.get(campaignId)?.get(peerId);
    if (member) this.#close(campaignId, member, 'ended');
  }

  /** The room ends (the table left online play): every stream closes, the DM's decisions go. */
  end(campaignId: string): void {
    for (const member of [...(this.#rooms.get(campaignId)?.values() ?? [])]) {
      this.#close(campaignId, member, 'ended');
    }
    this.#decisions.delete(campaignId);
    for (const key of [...this.#counts.keys()]) {
      if (key.startsWith(`${campaignId} `)) this.#counts.delete(key);
    }
  }

  /** Who is in the campaign's room, for tests and the DM. */
  peers(campaignId: string): readonly string[] {
    return [...(this.#rooms.get(campaignId)?.keys() ?? [])];
  }

  #close(campaignId: string, member: Member, reason: VoiceCloseReason): void {
    member.sink.write(frame('closed', { reason }));
    member.sink.end();
    this.leave(campaignId, member.peerId);
  }

  #decisionsOf(campaignId: string): Decisions {
    let decisions = this.#decisions.get(campaignId);
    if (decisions === undefined) {
      decisions = { muted: new Set(), removed: new Set() };
      this.#decisions.set(campaignId, decisions);
    }
    return decisions;
  }

  /** Writes to one speaker's stream; one too far behind is dropped and leaves the room. */
  #send(campaignId: string, member: Member, text: string): void {
    member.sink.write(text);
    if (member.sink.unsent() > BACKLOG_BYTES) {
      member.sink.destroy();
      this.leave(campaignId, member.peerId);
    }
  }

  /** Tells everyone in the room who is in it now. */
  #tell(campaignId: string): void {
    const room = this.#rooms.get(campaignId);
    if (!room) return;
    const peers = [...room.values()].map((member) => ({
      peerId: member.peerId,
      name: member.name,
      dm: member.dm,
      muted: member.muted,
    }));
    for (const member of [...room.values()]) {
      const shown: VoiceRoom = { you: member.peerId, peers };
      this.#send(campaignId, member, frame('room', shown));
    }
  }

  /** Keeps every open stream alive while any room is open. */
  #beat(): void {
    if (this.#rooms.size > 0 && this.#heartbeat === null) {
      this.#heartbeat = setInterval(() => {
        for (const [campaignId, room] of [...this.#rooms]) {
          for (const member of [...room.values()]) {
            this.#send(campaignId, member, ': heartbeat\n\n');
          }
        }
      }, HEARTBEAT_MS);
      this.#heartbeat.unref();
    } else if (this.#rooms.size === 0 && this.#heartbeat !== null) {
      clearInterval(this.#heartbeat);
      this.#heartbeat = null;
    }
  }
}
