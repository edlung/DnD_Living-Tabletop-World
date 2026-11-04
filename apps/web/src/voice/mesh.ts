import type { VoicePeer, VoiceRoom, VoiceSignal, VoiceSignalFrom } from '@ltw/contracts';

/**
 * The table's voice between screens (docs/adr/0060-voice.md §2, §4–7): one WebRTC audio connection
 * to every other speaker in the room. Of each two, the one with the smaller peer ID offers, so two
 * offers never cross; a failed connection restarts its candidates. What a screen hears of each is
 * read from the connection's statistics: whether sound arrives, and whether they talk.
 */
export interface Heard {
  readonly state: RTCPeerConnectionState;
  /** Sound arrives from them. */
  readonly hearing: boolean;
  /** They talk now. */
  readonly talking: boolean;
}

interface Link {
  readonly connection: RTCPeerConnection;
  /**
   * Where this screen's microphone goes on this connection: the offerer's own transceiver, the
   * answerer's once the offer made one (a transceiver added before it would never be matched).
   */
  sender: RTCRtpSender | null;
  audio: HTMLAudioElement | null;
  /** Candidates that came before the description they belong to. */
  pending: RTCIceCandidateInit[];
  bytes: number;
  heard: Heard;
}

/** Louder than this, a speaker talks (the statistics' audio level, 0–1). */
const TALKING = 0.02;

export class VoiceMesh {
  readonly #send: (signal: VoiceSignal) => void;
  readonly #ice: RTCIceServer[];
  readonly #changed: () => void;
  readonly #links = new Map<string, Link>();
  #me: string | null = null;
  #peers: readonly VoicePeer[] = [];
  #track: MediaStreamTrack | null = null;
  #talking = false;
  #listening = true;

  constructor(options: {
    readonly send: (signal: VoiceSignal) => void;
    readonly iceServers: RTCIceServer[];
    readonly onChange: () => void;
  }) {
    this.#send = options.send;
    this.#ice = options.iceServers;
    this.#changed = options.onChange;
  }

  /** What this screen hears of each other speaker, by peer ID. */
  heard(): ReadonlyMap<string, Heard> {
    return new Map([...this.#links].map(([peer, link]) => [peer, link.heard]));
  }

  /** Whether the DM muted this screen's speaker. */
  get mutedByDm(): boolean {
    return this.#peers.find((peer) => peer.peerId === this.#me)?.muted ?? false;
  }

  /** The microphone's track to send; null for none (refused, or not chosen yet). */
  microphone(track: MediaStreamTrack | null): void {
    this.#track = track;
    this.#apply();
    for (const link of this.#links.values()) void link.sender?.replaceTrack(track);
  }

  /** Whether this screen's speaker talks now (unmuted, or holding push to talk). */
  talk(on: boolean): void {
    this.#talking = on;
    this.#apply();
  }

  /** Whether this screen plays the others' voices ("in the same room as another": not). */
  listen(on: boolean): void {
    this.#listening = on;
    for (const [peer, link] of this.#links) this.#play(peer, link);
  }

  /** Who is in the room now: connects to the new, lets go of the gone, follows the DM's mutes. */
  room(room: VoiceRoom): void {
    this.#me = room.you;
    this.#peers = room.peers;
    const others = new Set(room.peers.map((peer) => peer.peerId).filter((id) => id !== room.you));
    for (const peer of [...this.#links.keys()]) if (!others.has(peer)) this.#drop(peer);
    for (const peer of others) {
      if (!this.#links.has(peer) && room.you < peer) void this.#offer(peer, false);
    }
    this.#apply();
    for (const [peer, link] of this.#links) this.#play(peer, link);
    this.#changed();
  }

  /** Another speaker's offer, answer or candidate. */
  async signal(message: VoiceSignalFrom): Promise<void> {
    const peer = message.from;
    if (message.kind === 'offer') {
      const link = this.#links.get(peer) ?? this.#link(peer, false);
      await link.connection.setRemoteDescription({ type: 'offer', sdp: message.sdp });
      // The offer's audio line made the answerer's transceiver: it sends this screen's voice too.
      if (!link.sender) {
        const transceiver = link.connection
          .getTransceivers()
          .find((one) => one.receiver.track.kind === 'audio');
        if (transceiver) {
          transceiver.direction = 'sendrecv';
          link.sender = transceiver.sender;
          if (this.#track) await transceiver.sender.replaceTrack(this.#track);
        }
      }
      await this.#flush(link);
      const answer = await link.connection.createAnswer();
      await link.connection.setLocalDescription(answer);
      this.#send({ to: peer, kind: 'answer', sdp: answer.sdp ?? '' });
      return;
    }
    const link = this.#links.get(peer);
    if (!link) return;
    if (message.kind === 'answer') {
      await link.connection.setRemoteDescription({ type: 'answer', sdp: message.sdp });
      await this.#flush(link);
      return;
    }
    const candidate: RTCIceCandidateInit = {
      candidate: message.candidate,
      sdpMid: message.sdpMid,
      sdpMLineIndex: message.sdpMLineIndex,
    };
    if (link.connection.remoteDescription) {
      await link.connection.addIceCandidate(candidate).catch(() => undefined);
    } else {
      link.pending.push(candidate);
    }
  }

  /** Reads what arrives from each speaker, for who talks and whether anyone is heard. */
  async measure(): Promise<void> {
    for (const link of this.#links.values()) {
      const stats = await link.connection.getStats().catch(() => null);
      let bytes = link.bytes;
      let level = 0;
      stats?.forEach(
        (report: { type?: string; kind?: string; bytesReceived?: number; audioLevel?: number }) => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            bytes = report.bytesReceived ?? bytes;
            level = report.audioLevel ?? 0;
          }
        },
      );
      link.heard = {
        state: link.connection.connectionState,
        hearing: bytes > link.bytes,
        talking: bytes > link.bytes && level > TALKING,
      };
      link.bytes = bytes;
    }
    this.#changed();
  }

  /** Lets go of every connection. */
  close(): void {
    for (const peer of [...this.#links.keys()]) this.#drop(peer);
  }

  #link(peer: string, offering: boolean): Link {
    const connection = new RTCPeerConnection({ iceServers: this.#ice });
    const sender = offering
      ? connection.addTransceiver('audio', { direction: 'sendrecv' }).sender
      : null;
    if (sender && this.#track) void sender.replaceTrack(this.#track);
    const link: Link = {
      connection,
      sender,
      audio: null,
      pending: [],
      bytes: 0,
      heard: { state: 'new', hearing: false, talking: false },
    };
    connection.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.#send({
        to: peer,
        kind: 'candidate',
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      });
    };
    connection.ontrack = (event) => {
      const audio = link.audio ?? new Audio();
      audio.autoplay = true;
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      link.audio = audio;
      this.#play(peer, link);
    };
    connection.onconnectionstatechange = () => {
      link.heard = { ...link.heard, state: connection.connectionState };
      // The one who offers starts again when the way between them fails.
      if (connection.connectionState === 'failed' && this.#me !== null && this.#me < peer) {
        void this.#offer(peer, true);
      }
      this.#changed();
    };
    this.#links.set(peer, link);
    return link;
  }

  async #offer(peer: string, restart: boolean): Promise<void> {
    const link = this.#links.get(peer) ?? this.#link(peer, true);
    const offer = await link.connection.createOffer(restart ? { iceRestart: true } : undefined);
    await link.connection.setLocalDescription(offer);
    this.#send({ to: peer, kind: 'offer', sdp: offer.sdp ?? '' });
  }

  async #flush(link: Link): Promise<void> {
    const waiting = link.pending;
    link.pending = [];
    for (const candidate of waiting) {
      await link.connection.addIceCandidate(candidate).catch(() => undefined);
    }
  }

  #drop(peer: string): void {
    const link = this.#links.get(peer);
    if (!link) return;
    link.connection.close();
    if (link.audio) {
      link.audio.pause();
      link.audio.srcObject = null;
    }
    this.#links.delete(peer);
  }

  /** A voice plays unless this screen does not listen or the DM muted its speaker. */
  #play(peer: string, link: Link): void {
    if (!link.audio) return;
    const muted = this.#peers.find((one) => one.peerId === peer)?.muted ?? false;
    link.audio.muted = !this.#listening || muted;
    if (!link.audio.muted) void link.audio.play().catch(() => undefined);
  }

  /** The microphone sends while this speaker talks and the DM has not muted them. */
  #apply(): void {
    if (this.#track) this.#track.enabled = this.#talking && !this.mutedByDm;
  }
}
