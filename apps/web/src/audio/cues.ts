import type { RollEntry } from '@ltw/contracts';

import { soundOut } from '../dice/audio.ts';
import { seeded } from './schedule.ts';

/**
 * What came of a roll, as a short sound (docs/adr/0059-atmosphere.md §2): a hit, a miss, a
 * critical hit, a success, a failure, a spell and healing — each a few tones or a burst of noise,
 * synthesized here, never recorded, heard where the roll lands and at the dice's volume.
 */
export const CUES = ['hit', 'miss', 'critical', 'success', 'failure', 'spell', 'healing'] as const;
export type Cue = (typeof CUES)[number];

/** One voice of a cue: a tone, or noise through a filter, gliding from `hz` to `toHz`. */
export interface Voice {
  readonly kind: 'tone' | 'noise';
  /** Seconds from the cue's start. */
  readonly at: number;
  readonly seconds: number;
  /** 0–1, before the volume. */
  readonly level: number;
  readonly hz: number;
  readonly toHz?: number;
  readonly wave?: OscillatorType;
  readonly filter?: BiquadFilterType;
  readonly q?: number;
  /** Seconds to rise; else 5 ms, a struck sound's. */
  readonly rise?: number;
}

const THUMP: readonly Voice[] = [
  { kind: 'noise', at: 0, seconds: 0.09, level: 0.5, hz: 1400, toHz: 400, filter: 'lowpass' },
  { kind: 'tone', at: 0, seconds: 0.12, level: 0.6, hz: 120, toHz: 70, wave: 'sine' },
];

/** A chord broken upwards: notes a step apart, each ringing out. */
const arpeggio = (
  notes: readonly number[],
  step: number,
  seconds: number,
  level: number,
  wave: OscillatorType,
  rise?: number,
): Voice[] =>
  notes.map((hz, index) => ({
    kind: 'tone',
    at: index * step,
    seconds,
    level,
    hz,
    wave,
    ...(rise === undefined ? {} : { rise }),
  }));

export const VOICES: Readonly<Record<Cue, readonly Voice[]>> = {
  // A blow landing: a dull knock and a low thump.
  hit: THUMP,
  // A blade through the air: noise sweeping down, soft.
  miss: [
    {
      kind: 'noise',
      at: 0,
      seconds: 0.28,
      level: 0.25,
      hz: 2400,
      toHz: 700,
      filter: 'bandpass',
      q: 1.2,
      rise: 0.04,
    },
  ],
  // The blow, a bright ring over it, a boom under it.
  critical: [
    ...THUMP,
    { kind: 'tone', at: 0.02, seconds: 0.7, level: 0.18, hz: 1320, wave: 'triangle' },
    { kind: 'tone', at: 0.05, seconds: 0.6, level: 0.1, hz: 1980, wave: 'sine' },
    { kind: 'tone', at: 0, seconds: 0.35, level: 0.5, hz: 60, toHz: 45, wave: 'sine' },
  ],
  // Two notes rising a major third.
  success: arpeggio([659.3, 830.6], 0.12, 0.5, 0.25, 'sine'),
  // Two notes falling a minor third, muted.
  failure: arpeggio([392, 329.6], 0.16, 0.5, 0.22, 'triangle'),
  // A shimmer: four notes climbing, and air rising behind them.
  spell: [
    ...arpeggio([880, 1108.7, 1318.5, 1760], 0.07, 0.9, 0.1, 'sine'),
    {
      kind: 'noise',
      at: 0,
      seconds: 0.6,
      level: 0.06,
      hz: 4000,
      toHz: 7000,
      filter: 'highpass',
      rise: 0.2,
    },
  ],
  // A warm chord broken upwards, softly.
  healing: arpeggio([523.3, 659.3, 784, 1046.5], 0.09, 0.8, 0.14, 'triangle', 0.02),
};

/**
 * The cue of one throw of a roll as it lands (its group `index`): a critical hit, healing, a hit
 * or a miss, a success or a failure; a spell's first throw that says neither, the spell's own; the
 * rest — damage after an attack, free dice, initiative — none: their dice are heard already.
 */
export function cueFor(entry: RollEntry, index: number): Cue | null {
  const group = entry.groups[index];
  if (!group) return null;
  if (group.critical) return 'critical';
  if (group.purpose === 'healing') return 'healing';
  if (group.result) return group.result;
  return entry.subject.kind === 'spell' && index === 0 ? 'spell' : null;
}

/** Half a second of white noise per context, the noise voices' source. */
const noises = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseOf(context: BaseAudioContext): AudioBuffer {
  const known = noises.get(context);
  if (known) return known;
  const random = seeded(2);
  const length = Math.round(context.sampleRate * 0.5);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i += 1) samples[i] = random() * 2 - 1;
  const made = context.createBuffer(1, length, context.sampleRate);
  made.copyToChannel(samples, 0);
  noises.set(context, made);
  return made;
}

/** Plays a cue's voices into `out` from now, at `volume` (0–1). */
export function playCueInto(
  context: BaseAudioContext,
  out: AudioNode,
  cue: Cue,
  volume: number,
): void {
  const start = context.currentTime + 0.02;
  const level = context.createGain();
  level.gain.value = volume * 0.8;
  level.connect(out);
  for (const voice of VOICES[cue]) {
    const at = start + voice.at;
    const end = at + voice.seconds;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(voice.level, at + (voice.rise ?? 0.005));
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    envelope.connect(level);
    let source: AudioScheduledSourceNode;
    if (voice.kind === 'tone') {
      const tone = context.createOscillator();
      tone.type = voice.wave ?? 'sine';
      tone.frequency.setValueAtTime(voice.hz, at);
      if (voice.toHz !== undefined) tone.frequency.exponentialRampToValueAtTime(voice.toHz, end);
      tone.connect(envelope);
      source = tone;
    } else {
      const noise = context.createBufferSource();
      noise.buffer = noiseOf(context);
      noise.loop = true;
      const shape = context.createBiquadFilter();
      shape.type = voice.filter ?? 'lowpass';
      shape.Q.value = voice.q ?? 0.7;
      shape.frequency.setValueAtTime(voice.hz, at);
      if (voice.toHz !== undefined) shape.frequency.exponentialRampToValueAtTime(voice.toHz, end);
      noise.connect(shape).connect(envelope);
      source = noise;
    }
    source.start(at);
    source.stop(end + 0.02);
  }
}

/** Plays a cue on this screen at the dice's volume; silent for none, or until a press unlocked sound. */
export function playCue(cue: Cue | null, volume: number): void {
  const sound = soundOut();
  if (!sound || cue === null || volume <= 0) return;
  playCueInto(sound.context, sound.out, cue, volume);
}
