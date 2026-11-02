/**
 * The dice's sound (Stage 510, docs/PRODUCT_COMPLETION_PLAN.md decision 3): synthesized, never a
 * recording. Each bounce the throw's simulation reports plays one impact — a resin die on a wooden
 * table (a sharp click, the die's ring, the table's knock) or two dice knocking together — at its
 * time, loudness from its speed, panned to where it happened. The browser lets sound start only
 * after a gesture, so the context is created on the first press or key.
 */
let context: AudioContext | null = null;
let master: GainNode | null = null;
const banks = new Map<'table' | 'die', AudioBuffer[]>();

/** Creates (or resumes) the audio context; call from a user gesture. */
export function unlockAudio(): void {
  if (typeof AudioContext === 'undefined') return;
  if (!context) {
    context = new AudioContext();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    master = context.createGain();
    master.connect(limiter).connect(context.destination);
  }
  if (context.state === 'suspended') void context.resume();
}

/** Unlocks on the first press or key anywhere; harmless to call more than once. */
export function listenForUnlock(): () => void {
  const unlock = () => {
    unlockAudio();
  };
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true });
  return () => {
    window.removeEventListener('pointerdown', unlock, { capture: true });
    window.removeEventListener('keydown', unlock, { capture: true });
  };
}

interface Mode {
  readonly hz: number;
  readonly decay: number;
  readonly gain: number;
}

/** A pseudo-random sequence, so the impacts sound alike from one session to the next. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/**
 * One impact as samples: a click of noise lasting a few milliseconds (high-passed), the die's
 * resonant modes ringing out, and for the table a low knock.
 */
export function impact(rate: number, kind: 'table' | 'die', seed: number): Float32Array {
  const random = seeded(seed);
  const seconds = kind === 'table' ? 0.2 : 0.12;
  const samples = new Float32Array(Math.round(seconds * rate));
  const detune = () => 0.88 + random() * 0.24;
  const modes: Mode[] =
    kind === 'table'
      ? [
          { hz: 3100 * detune(), decay: 0.034, gain: 0.32 },
          { hz: 4500 * detune(), decay: 0.024, gain: 0.22 },
          { hz: 6400 * detune(), decay: 0.016, gain: 0.15 },
          { hz: 8600 * detune(), decay: 0.01, gain: 0.08 },
          { hz: 820 * detune(), decay: 0.014, gain: 0.22 },
        ]
      : [
          { hz: 3600 * detune(), decay: 0.03, gain: 0.34 },
          { hz: 5300 * detune(), decay: 0.02, gain: 0.24 },
          { hz: 7700 * detune(), decay: 0.014, gain: 0.16 },
          { hz: 9900 * detune(), decay: 0.009, gain: 0.08 },
        ];
  const phases = modes.map(() => random() * Math.PI * 2);
  const thumpHz = 120 + random() * 60;
  let previous = 0;
  let filtered = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / rate;
    // A half-millisecond rise keeps the start from clicking.
    const rise = Math.min(1, t / 0.0005);
    const noise = random() * 2 - 1;
    // One-pole high-pass at ~1.6 kHz: the click's sharp edge without rumble.
    filtered = 0.8 * (filtered + noise - previous);
    previous = noise;
    let value = filtered * Math.exp(-t / 0.0026) * 0.9;
    for (const [index, mode] of modes.entries()) {
      value +=
        mode.gain *
        Math.exp(-t / mode.decay) *
        Math.sin(2 * Math.PI * mode.hz * t + (phases[index] ?? 0));
    }
    if (kind === 'table') {
      value += 0.5 * Math.exp(-t / 0.028) * Math.sin(2 * Math.PI * thumpHz * t);
    }
    samples[i] = value * rise;
  }
  const peak = samples.reduce((most, value) => Math.max(most, Math.abs(value)), 0) || 1;
  for (let i = 0; i < samples.length; i += 1) samples[i] = ((samples[i] ?? 0) / peak) * 0.9;
  return samples;
}

function bank(kind: 'table' | 'die'): AudioBuffer[] {
  const known = banks.get(kind);
  if (known || !context) return known ?? [];
  const audio = context;
  const built = Array.from({ length: 6 }, (_, index) => {
    const samples = impact(audio.sampleRate, kind, (kind === 'table' ? 101 : 707) + index * 37);
    const buffer = audio.createBuffer(1, samples.length, audio.sampleRate);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    return buffer;
  });
  banks.set(kind, built);
  return built;
}

export interface Impact {
  /** Seconds from now. */
  readonly time: number;
  /** Impact speed (the simulation's units). */
  readonly speed: number;
  /** −1 (left) to 1 (right). */
  readonly pan: number;
  readonly withDie: boolean;
}

/** Plays a throw's impacts at their times; `volume` is 0–1. Silent until unlocked. */
export function playImpacts(impacts: readonly Impact[], volume: number): void {
  if (!context || !master || context.state !== 'running' || volume <= 0) return;
  master.gain.value = volume * 0.8;
  const start = context.currentTime + 0.02;
  for (const [index, hit] of impacts.entries()) {
    const sounds = bank(hit.withDie ? 'die' : 'table');
    const buffer = sounds[index % sounds.length];
    if (!buffer) continue;
    const source = context.createBufferSource();
    source.buffer = buffer;
    // Harder knocks ring a little higher; loudness follows speed, softly capped.
    const strength = Math.min(1, hit.speed / 14);
    source.playbackRate.value = 0.94 + strength * 0.12;
    const gain = context.createGain();
    gain.gain.value = 0.08 + 0.92 * strength * strength;
    const pan = context.createStereoPanner();
    pan.pan.value = hit.pan * 0.7;
    source.connect(gain).connect(pan).connect(master);
    source.start(start + hit.time);
  }
}

/**
 * The companion's alert (docs/adr/0044-online-play.md §3): two soft bell notes, synthesized like the
 * dice, at the dice's volume. Silent until unlocked.
 */
export function playChime(volume: number): void {
  if (!context || !master || context.state !== 'running' || volume <= 0) return;
  master.gain.value = volume * 0.8;
  const start = context.currentTime + 0.02;
  for (const [index, hz] of [880, 1318.5].entries()) {
    const at = start + index * 0.16;
    const tone = context.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = hz;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.35, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.9);
    tone.connect(gain).connect(master);
    tone.start(at);
    tone.stop(at + 0.95);
  }
}
