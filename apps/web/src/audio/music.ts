import { musicPosition, type MusicPlaying } from '@ltw/contracts';

/**
 * The DM's music on one screen (docs/adr/0059-atmosphere.md §3). What the table's state asks of a
 * screen at a moment is pure — `musicPlan` — and the player brings the screen's own audio element
 * to it: its source the track's address on this server, streamed a range at a time and routed
 * through the table's sound out at this screen's volume.
 */
export type MusicPlan =
  | { readonly kind: 'none' }
  /** The track's length is not read yet: where it should be, once it is. */
  | { readonly kind: 'loading'; readonly at: number }
  | { readonly kind: 'playing'; readonly at: number }
  | { readonly kind: 'paused'; readonly at: number }
  /** Played once, to its end. */
  | { readonly kind: 'ended' };

/** Further off than this, a screen seeks back into step; nearer, it lets the music run. */
export const DRIFT_SECONDS = 1;

/**
 * What a screen plays at `now` (ms, the server's clock), given the track's length when read:
 * where in the track, playing or paused; a track played once past its end, nothing more.
 */
export function musicPlan(
  music: MusicPlaying | null,
  now: number,
  duration: number | null,
): MusicPlan {
  if (music === null) return { kind: 'none' };
  const position = musicPosition(music, now);
  if (duration === null || !Number.isFinite(duration) || duration <= 0) {
    return { kind: 'loading', at: position };
  }
  if (!music.repeat && position >= duration) return { kind: 'ended' };
  const at = music.repeat ? position % duration : position;
  return music.pausedAt === null ? { kind: 'playing', at } : { kind: 'paused', at };
}

/** One audio element and its way into the table's sound; one a page. */
export class MusicPlayer {
  readonly #audio: HTMLAudioElement;
  readonly #level: GainNode;
  readonly #context: BaseAudioContext;
  #source: string | null = null;

  constructor(context: AudioContext, out: AudioNode) {
    this.#context = context;
    this.#audio = new Audio();
    this.#audio.preload = 'auto';
    this.#level = context.createGain();
    context.createMediaElementSource(this.#audio).connect(this.#level).connect(out);
  }

  /** The track's length once its metadata is read; null before. */
  get duration(): number | null {
    const { duration } = this.#audio;
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  }

  /** Whether the element plays now. */
  get sounding(): boolean {
    return !this.#audio.paused && !this.#audio.ended;
  }

  /** This screen's volume, 0–1; the music sits at the ambience's loudest, under the dice. */
  volume(volume: number): void {
    this.#level.gain.setTargetAtTime(volume * 0.6, this.#context.currentTime, 0.1);
  }

  /** Calls `listener` whenever the element's state changes (metadata read, playing, paused). */
  listen(listener: () => void): () => void {
    const events = ['loadedmetadata', 'playing', 'pause', 'ended', 'error'] as const;
    for (const event of events) this.#audio.addEventListener(event, listener);
    return () => {
      for (const event of events) this.#audio.removeEventListener(event, listener);
    };
  }

  /** Brings the element to a plan: its source, its place in the track, playing or not. */
  follow(source: string | null, repeat: boolean, plan: MusicPlan): void {
    const audio = this.#audio;
    if (source !== this.#source) {
      this.#source = source;
      audio.pause();
      if (source === null) audio.removeAttribute('src');
      else audio.src = source;
      audio.load();
    }
    audio.loop = repeat;
    if (plan.kind === 'none' || plan.kind === 'ended' || source === null) {
      audio.pause();
      return;
    }
    if (plan.kind === 'loading') return;
    if (Math.abs(audio.currentTime - plan.at) > DRIFT_SECONDS) audio.currentTime = plan.at;
    if (plan.kind === 'paused') audio.pause();
    else if (audio.paused) void audio.play().catch(() => undefined);
  }

  /** Stops and lets go of the track. */
  close(): void {
    this.follow(null, false, { kind: 'none' });
  }
}
