import type { VoiceIceResponse, VoiceRoom } from '@ltw/contracts';
import { useSyncExternalStore } from 'react';

import type { WorldApi } from '../api/client.ts';
import { VoiceMesh, type Heard } from './mesh.ts';
import { openVoiceStream } from './voice-stream.ts';

/** Where this screen stands in the table's voice (docs/adr/0060-voice.md). */
export type VoiceStatus =
  /** Not in the room. */
  | 'out'
  /** Asking for the microphone and joining. */
  | 'joining'
  | 'in'
  /** The room would not take this screen: the session is not online, or the room is full. */
  | 'refused'
  /** The DM removed this screen's speaker. */
  | 'removed';

export interface VoiceShown {
  readonly status: VoiceStatus;
  readonly room: VoiceRoom | null;
  readonly heard: ReadonlyMap<string, Heard>;
  /** The browser refused the microphone: this screen listens only. */
  readonly noMicrophone: boolean;
  readonly microphones: readonly { readonly deviceId: string; readonly label: string }[];
  readonly microphone: string | null;
  /** Talk all the time (on), or only while push to talk is held (off). */
  readonly open: boolean;
  readonly holding: boolean;
  /** "In the same room as another": this screen plays nobody's voice. */
  readonly sameRoom: boolean;
  /** A relay carries the sound where screens cannot reach each other directly. */
  readonly relayed: boolean;
}

/** What arrives is read twice a second: who talks, whether anyone is heard. */
const MEASURE_MS = 500;

const microphoneOf = (deviceId: string | null): MediaStreamConstraints => ({
  audio: {
    ...(deviceId === null ? {} : { deviceId: { exact: deviceId } }),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: false,
});

const OUT: VoiceShown = {
  status: 'out',
  room: null,
  heard: new Map(),
  noMicrophone: false,
  microphones: [],
  microphone: null,
  open: true,
  holding: false,
  sameRoom: false,
  relayed: false,
};

/**
 * This page in the table's voice: the room's stream, the mesh to every other speaker, the
 * microphone — kept while the page lives, whatever sheet is open. Joining is a press (the browser
 * asks for the microphone then); a refused microphone still listens. Leaving lets go of all of it.
 */
export class VoiceSession {
  readonly #api: WorldApi;
  readonly #listeners = new Set<() => void>();
  #shown: VoiceShown = OUT;
  #mesh: VoiceMesh | null = null;
  #stream: MediaStream | null = null;
  #stop: (() => void) | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(api: WorldApi) {
    this.#api = api;
  }

  get shown(): VoiceShown {
    return this.#shown;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #set(change: Partial<VoiceShown>): void {
    this.#shown = { ...this.#shown, ...change };
    for (const listener of this.#listeners) listener();
  }

  join(): void {
    if (this.#mesh) return;
    this.#set({ status: 'joining' });
    void this.#join();
  }

  async #join(): Promise<void> {
    const ice = await this.#api
      .get<VoiceIceResponse>('voice/ice', AbortSignal.timeout(10_000), false)
      .catch((): VoiceIceResponse => ({ iceServers: [] }));
    const mesh = new VoiceMesh({
      iceServers: ice.iceServers.map((server) => ({ ...server, urls: [...server.urls] })),
      send: (signal) => {
        void this.#api
          .post('voice/signal', signal, AbortSignal.timeout(10_000))
          .catch(() => undefined);
      },
      onChange: () => {
        this.#set({ heard: mesh.heard() });
      },
    });
    this.#mesh = mesh;
    this.#set({ relayed: ice.iceServers.length > 0 });
    // The microphone comes when the browser gives it: an unanswered question still lets this
    // screen listen meanwhile.
    void this.#useMicrophone(this.#shown.microphone).then(() => {
      this.#apply();
    });
    this.#stop = openVoiceStream(
      (signal) => this.#api.openStream('voice/stream', signal),
      (event) => {
        if (event.kind === 'room') {
          mesh.room(event.room);
          this.#apply();
          this.#set({ room: event.room, status: 'in' });
        } else if (event.kind === 'signal') {
          void mesh.signal(event.signal).catch(() => undefined);
        } else if (event.kind === 'closed' || event.kind === 'refused') {
          this.#letGo();
          this.#set({
            status:
              event.kind === 'closed' && event.reason === 'removed'
                ? 'removed'
                : event.kind === 'closed' && event.reason === 'replaced'
                  ? 'out'
                  : 'refused',
          });
        }
      },
    );
    this.#timer = setInterval(() => void mesh.measure(), MEASURE_MS);
  }

  async #useMicrophone(deviceId: string | null): Promise<void> {
    try {
      const next = await navigator.mediaDevices.getUserMedia(microphoneOf(deviceId));
      for (const track of this.#stream?.getTracks() ?? []) track.stop();
      this.#stream = next;
      this.#mesh?.microphone(next.getAudioTracks()[0] ?? null);
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.#set({
        noMicrophone: false,
        microphones: devices
          .filter((device) => device.kind === 'audioinput')
          .map((device) => ({ deviceId: device.deviceId, label: device.label })),
      });
    } catch {
      this.#set({ noMicrophone: true });
    }
  }

  /** Talks while open or while push to talk is held; plays the others unless in a shared room. */
  #apply(): void {
    this.#mesh?.talk(this.#shown.open || this.#shown.holding);
    this.#mesh?.listen(!this.#shown.sameRoom);
  }

  #letGo(): void {
    this.#stop?.();
    this.#stop = null;
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
    this.#mesh?.close();
    this.#mesh = null;
    for (const track of this.#stream?.getTracks() ?? []) track.stop();
    this.#stream = null;
    this.#set({ room: null, heard: new Map() });
  }

  leave(): void {
    this.#letGo();
    this.#set({ status: 'out' });
  }

  /**
   * A new room (the table plays online again): what an earlier room said of this screen — the DM's
   * removal, a refusal — ended with that room (ADR 0060 §6).
   */
  forgetEarlierRoom(): void {
    if (this.shown.status === 'removed' || this.shown.status === 'refused') {
      this.#set({ status: 'out' });
    }
  }

  setOpen(open: boolean): void {
    this.#set({ open });
    this.#apply();
  }

  hold(holding: boolean): void {
    this.#set({ holding });
    this.#apply();
  }

  setSameRoom(sameRoom: boolean): void {
    // In a shared room the microphone talks only by push to talk.
    this.#set(sameRoom ? { sameRoom, open: false } : { sameRoom });
    this.#apply();
  }

  choose(deviceId: string): void {
    this.#set({ microphone: deviceId });
    void this.#useMicrophone(deviceId).then(() => {
      this.#apply();
    });
  }

  /** The DM's: a speaker muted for everyone, or let talk. */
  muteFor(peerId: string, muted: boolean): void {
    void this.#api
      .post('voice/mute', { peerId, muted }, AbortSignal.timeout(10_000))
      .catch(() => undefined);
  }

  /** The DM's: a speaker out of the room. */
  remove(peerId: string): void {
    void this.#api
      .post('voice/remove', { peerId }, AbortSignal.timeout(10_000))
      .catch(() => undefined);
  }
}

/** One voice session a campaign's page. */
const sessions = new Map<string, VoiceSession>();

export function voiceSession(api: WorldApi): VoiceSession {
  const known = sessions.get(api.campaignId);
  if (known) return known;
  const made = new VoiceSession(api);
  sessions.set(api.campaignId, made);
  return made;
}

/** This page's voice and what it shows, followed as it changes. */
export function useVoice(api: WorldApi): {
  readonly session: VoiceSession;
  readonly shown: VoiceShown;
} {
  const session = voiceSession(api);
  const shown = useSyncExternalStore(
    session.subscribe,
    () => session.shown,
    () => OUT,
  );
  return { session, shown };
}
