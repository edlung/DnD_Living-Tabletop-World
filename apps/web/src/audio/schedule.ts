/**
 * The moments of a soundscape (docs/adr/0059-atmosphere.md §1): when a raindrop lands, a log
 * crackles, a cricket chirps — pure and seeded, so the same window of the same soundscape always
 * holds the same events and a test can count them. The audio graph only plays what these return.
 */
export interface SoundEvent {
  /** Seconds from the window's start. */
  readonly at: number;
  /** 0–1. */
  readonly loudness: number;
  /** −1 (left) to 1 (right). */
  readonly pan: number;
  /** A playback-rate factor around 1: a drop's or a pop's pitch. */
  readonly pitch: number;
}

/** A pseudo-random sequence from a seed (the dice's own recipe). */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Events at a mean rate per second, spread at random over a window of `seconds`. */
function scatter(
  random: () => number,
  seconds: number,
  rate: number,
  shape: (random: () => number) => Omit<SoundEvent, 'at'>,
): SoundEvent[] {
  const events: SoundEvent[] = [];
  // Exponential gaps: a Poisson stream, as rain and fire are.
  for (let at = -Math.log(1 - random()) / rate; at < seconds; at += -Math.log(1 - random()) / rate)
    events.push({ at, ...shape(random) });
  return events;
}

/** Raindrops: many, light, all across the room. */
export const raindrops = (seed: number, seconds: number): SoundEvent[] =>
  scatter(seeded(seed), seconds, 18, (random) => ({
    loudness: 0.15 + 0.5 * random() ** 2,
    pan: random() * 2 - 1,
    pitch: 0.7 + random() * 0.8,
  }));

/** A fire's crackle: a few pops at a time, some sharp. */
export function crackles(seed: number, seconds: number): SoundEvent[] {
  const random = seeded(seed);
  return scatter(random, seconds, 1.6, (next) => ({
    loudness: 0.25 + 0.75 * next() ** 3,
    pan: next() * 0.8 - 0.4,
    pitch: 0.6 + next() * 1.2,
  }))
    .flatMap((pop) =>
      // A log often snaps twice in quick succession.
      random() < 0.35
        ? [pop, { ...pop, at: pop.at + 0.03 + random() * 0.06, loudness: pop.loudness * 0.6 }]
        : [pop],
    )
    .filter((pop) => pop.at < seconds);
}

/** A cricket's chirps: three quick pulses, then quiet, the rhythm loose. */
export function chirps(seed: number, seconds: number): SoundEvent[] {
  const random = seeded(seed);
  const events: SoundEvent[] = [];
  const pan = random() * 1.4 - 0.7;
  for (let at = random() * 0.8; at < seconds; at += 0.75 + random() * 0.6) {
    const loudness = 0.4 + random() * 0.4;
    for (let pulse = 0; pulse < 3; pulse += 1)
      if (at + pulse * 0.055 < seconds)
        events.push({ at: at + pulse * 0.055, loudness, pan, pitch: 1 + (random() - 0.5) * 0.04 });
  }
  return events;
}
