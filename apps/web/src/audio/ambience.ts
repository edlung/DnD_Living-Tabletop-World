import type { Ambience } from '@ltw/contracts';

import { noiseKit, soundscape, type NoiseKit, type Soundscape } from './soundscapes.ts';

/** Seconds a soundscape takes to fade in, or out under the next. */
export const FADE_SECONDS = 1.5;
/** How far ahead the moments are played: a timer that runs late still finds them there. */
const AHEAD_SECONDS = 2.5;
/** The ambience sits beneath the dice: its loudest is half of theirs. */
const LEVEL = 0.5;

/**
 * The table's ambience on one screen (docs/adr/0059-atmosphere.md §1): one soundscape at a time,
 * the next fading in over the last, at this screen's volume. Its moments are played a window of a
 * second at a time, a few seconds ahead; `fill` plays the windows due, and the screen's timer calls
 * it twice a second.
 */
export class AmbiencePlayer {
  readonly #context: BaseAudioContext;
  readonly #out: GainNode;
  readonly #kit: NoiseKit;
  #playing: Soundscape | null = null;
  #filledUntil = 0;
  #window = 0;

  constructor(context: BaseAudioContext, out: AudioNode) {
    this.#context = context;
    this.#out = context.createGain();
    this.#out.gain.value = 0;
    this.#out.connect(out);
    this.#kit = noiseKit(context);
  }

  /** The soundscape playing, or fading in; null when silent. */
  get ambience(): Ambience | null {
    return this.#playing?.ambience ?? null;
  }

  /** Fades to a soundscape, or to silence; the one already playing plays on. */
  play(ambience: Ambience | null): void {
    if (this.ambience === ambience) return;
    const now = this.#context.currentTime;
    const old = this.#playing;
    if (old) {
      const level = old.fade.gain;
      level.cancelScheduledValues(now);
      level.setValueAtTime(level.value, now);
      level.linearRampToValueAtTime(0, now + FADE_SECONDS);
      old.stop(now + FADE_SECONDS + 0.05);
    }
    this.#playing = ambience === null ? null : soundscape(this.#kit, ambience, this.#out);
    if (!this.#playing) return;
    const level = this.#playing.fade.gain;
    level.setValueAtTime(0, now);
    level.linearRampToValueAtTime(1, now + FADE_SECONDS);
    this.#filledUntil = now;
    this.fill();
  }

  /** This screen's volume, 0–1, eased so that a slider never clicks. */
  volume(volume: number): void {
    this.#out.gain.setTargetAtTime(volume * LEVEL, this.#context.currentTime, 0.1);
  }

  /** Plays the windows due: up to a few seconds from now; a screen that slept skips what it missed. */
  fill(): void {
    const playing = this.#playing;
    if (!playing) return;
    const now = this.#context.currentTime;
    if (this.#filledUntil < now) this.#filledUntil = now + 0.05;
    while (this.#filledUntil < now + AHEAD_SECONDS) {
      playing.fill(this.#filledUntil, this.#window);
      this.#filledUntil += 1;
      this.#window += 1;
    }
  }
}
