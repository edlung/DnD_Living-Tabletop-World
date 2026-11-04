import type { Ambience } from '@ltw/contracts';

import { chirps, crackles, raindrops, seeded, type SoundEvent } from './schedule.ts';

/**
 * The five soundscapes as audio graphs (docs/adr/0059-atmosphere.md §1): beds of looped noise
 * shaped by filters, and the moments the schedule gives — drops, pops, chirps, a crowd's murmur,
 * the wind's gusts — played one window of a second at a time. Nothing is recorded: every sound is
 * computed here, from seeds, so the same window always plays the same.
 */

/** The noises every soundscape is made of, computed once for a context. */
export interface NoiseKit {
  readonly context: BaseAudioContext;
  /** Two seconds of white noise: the hiss of rain, the breath of a crowd. */
  readonly white: AudioBuffer;
  /** Two seconds of brown noise, looping without a seam: the roar of wind and fire. */
  readonly brown: AudioBuffer;
  /** A raindrop's tick: bright noise and a small ring, dying in 30 ms. */
  readonly drop: AudioBuffer;
  /** A log's snap: sharp noise, gone in 12 ms. */
  readonly pop: AudioBuffer;
}

/** One soundscape playing: everything it plays passes through its own fade. */
export interface Soundscape {
  readonly ambience: Ambience;
  readonly fade: GainNode;
  /** Plays the moments of one window of a second from a context time; `window` seeds it. */
  readonly fill: (start: number, window: number) => void;
  /** Stops its beds at a context time; its fade lets go of the output after that. */
  readonly stop: (at: number) => void;
}

const LOOP_SECONDS = 2;

function samplesOf(
  context: BaseAudioContext,
  seconds: number,
  fill: (samples: Float32Array, rate: number) => void,
): AudioBuffer {
  const length = Math.round(seconds * context.sampleRate);
  const samples = new Float32Array(length);
  fill(samples, context.sampleRate);
  const most = samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0) || 1;
  for (let i = 0; i < length; i += 1) samples[i] = ((samples[i] ?? 0) / most) * 0.9;
  const made = context.createBuffer(1, length, context.sampleRate);
  made.copyToChannel(samples, 0);
  return made;
}

export function noiseKit(context: BaseAudioContext): NoiseKit {
  const random = seeded(59);
  const white = samplesOf(context, LOOP_SECONDS, (samples) => {
    for (let i = 0; i < samples.length; i += 1) samples[i] = random() * 2 - 1;
  });
  const brown = samplesOf(context, LOOP_SECONDS, (samples, rate) => {
    // A little more than the loop, its head blended into its tail: the loop never clicks.
    const overlap = Math.round(rate * 0.05);
    const raw = new Float32Array(samples.length + overlap);
    let last = 0;
    for (let i = 0; i < raw.length; i += 1) {
      last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
      raw[i] = last;
    }
    for (let i = 0; i < samples.length; i += 1) {
      const tail = raw[samples.length + i] ?? 0;
      samples[i] =
        i < overlap ? (raw[i] ?? 0) * (i / overlap) + tail * (1 - i / overlap) : (raw[i] ?? 0);
    }
  });
  const drop = samplesOf(context, 0.03, (samples, rate) => {
    let previous = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const t = i / rate;
      const noise = random() * 2 - 1;
      samples[i] =
        (noise - previous) * Math.exp(-t / 0.004) +
        0.6 * Math.exp(-t / 0.007) * Math.sin(2 * Math.PI * 2600 * t);
      previous = noise;
    }
  });
  const pop = samplesOf(context, 0.012, (samples, rate) => {
    for (let i = 0; i < samples.length; i += 1)
      samples[i] = (random() * 2 - 1) * Math.exp(-i / rate / 0.0015);
  });
  return { context, white, brown, drop, pop };
}

/** The graph's small parts, each connected onward to `to` and returned. */
function gain(context: BaseAudioContext, value: number, to: AudioNode): GainNode {
  const node = context.createGain();
  node.gain.value = value;
  node.connect(to);
  return node;
}

function filter(
  context: BaseAudioContext,
  type: BiquadFilterType,
  hz: number,
  q: number,
  to: AudioNode,
): BiquadFilterNode {
  const node = context.createBiquadFilter();
  node.type = type;
  node.frequency.value = hz;
  node.Q.value = q;
  node.connect(to);
  return node;
}

function panned(context: BaseAudioContext, pan: number, to: AudioNode): StereoPannerNode {
  const node = context.createStereoPanner();
  node.pan.value = pan;
  node.connect(to);
  return node;
}

/** A bed: a noise looping from its own offset, so two beds never move together. */
function bed(kit: NoiseKit, noise: AudioBuffer, offset: number, to: AudioNode) {
  const source = kit.context.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  source.connect(to);
  source.start(kit.context.currentTime, offset % LOOP_SECONDS);
  return source;
}

/** One moment from a short buffer: its pitch, its loudness, its place in the room. */
function shot(
  kit: NoiseKit,
  sound: AudioBuffer,
  event: SoundEvent,
  at: number,
  level: number,
  to: AudioNode,
) {
  const source = kit.context.createBufferSource();
  source.buffer = sound;
  source.playbackRate.value = event.pitch;
  source.connect(gain(kit.context, event.loudness * level, panned(kit.context, event.pan, to)));
  source.start(at);
}

/** A cricket's pulse: a high tone that rises in 5 ms and fades in 40. */
function chirp(
  context: BaseAudioContext,
  event: SoundEvent,
  at: number,
  hz: number,
  to: AudioNode,
) {
  const tone = context.createOscillator();
  tone.type = 'sine';
  tone.frequency.value = hz * event.pitch;
  const envelope = gain(context, 0, panned(context, event.pan, to));
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(event.loudness * 0.05, at + 0.005);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
  tone.connect(envelope);
  tone.start(at);
  tone.stop(at + 0.05);
}

/** Times through a window at random gaps between `shortest` and `longest` seconds. */
function beats(random: () => number, shortest: number, longest: number): number[] {
  const times: number[] = [];
  for (let at = random() * shortest; at < 1; at += shortest + random() * (longest - shortest))
    times.push(at);
  return times;
}

type Parts = Pick<Soundscape, 'fill'> & { readonly beds: readonly AudioScheduledSourceNode[] };

const SEEDS: Readonly<Record<Ambience, number>> = {
  rain: 11,
  wind: 23,
  fire: 37,
  crowd: 41,
  night: 53,
};

function rain(kit: NoiseKit, fade: GainNode): Parts {
  const { context } = kit;
  const hiss = filter(
    context,
    'highpass',
    900,
    0.5,
    filter(context, 'lowpass', 7000, 0.5, gain(context, 0.16, fade)),
  );
  const patter = filter(context, 'lowpass', 500, 0.7, gain(context, 0.14, fade));
  const drops = filter(context, 'highpass', 1200, 0.5, fade);
  return {
    beds: [bed(kit, kit.white, 0.3, hiss), bed(kit, kit.brown, 1.1, patter)],
    fill: (start, window) => {
      for (const event of raindrops(SEEDS.rain + window * 7919, 1))
        shot(kit, kit.drop, event, start + event.at, 0.22, drops);
    },
  };
}

function wind(kit: NoiseKit, fade: GainNode): Parts {
  const { context } = kit;
  const gusts = gain(context, 0.25, fade);
  const band = filter(context, 'bandpass', 600, 0.6, gusts);
  const whistle = filter(context, 'bandpass', 1400, 9, gain(context, 0.03, fade));
  return {
    beds: [bed(kit, kit.brown, 0, band), bed(kit, kit.white, 0.7, whistle)],
    fill: (start, window) => {
      const random = seeded(SEEDS.wind + window * 7919);
      // Gusts rise and fall slowly: a new aim every half second or so, reached over a second.
      for (const at of beats(random, 0.35, 0.8)) {
        gusts.gain.setTargetAtTime(0.1 + 0.35 * random() ** 2, start + at, 0.9);
        band.frequency.setTargetAtTime(350 + random() * 700, start + at, 1.4);
      }
      whistle.frequency.setTargetAtTime(1000 + random() * 900, start, 2);
    },
  };
}

function fire(kit: NoiseKit, fade: GainNode): Parts {
  const { context } = kit;
  const flicker = gain(context, 0.4, fade);
  const roar = filter(context, 'lowpass', 260, 0.7, flicker);
  const hiss = filter(context, 'bandpass', 2600, 0.6, gain(context, 0.02, fade));
  const pops = filter(context, 'highpass', 700, 0.5, fade);
  return {
    beds: [bed(kit, kit.brown, 0.5, roar), bed(kit, kit.white, 1.3, hiss)],
    fill: (start, window) => {
      const random = seeded(SEEDS.fire + window * 7919);
      for (const at of beats(random, 0.12, 0.35))
        flicker.gain.setTargetAtTime(0.28 + random() * 0.22, start + at, 0.08);
      for (const event of crackles(SEEDS.fire + window * 7919, 1))
        shot(kit, kit.pop, event, start + event.at, 0.5, pops);
    },
  };
}

/** A crowd's voices: noise through a voice's formants, swelling and falling like syllables. */
const VOICES = [
  { hz: 380, pan: -0.6 },
  { hz: 620, pan: 0.4 },
  { hz: 950, pan: -0.2 },
  { hz: 1350, pan: 0.65 },
  { hz: 2300, pan: 0 },
] as const;

function crowd(kit: NoiseKit, fade: GainNode): Parts {
  const { context } = kit;
  const murmur = filter(context, 'lowpass', 900, 0.7, gain(context, 0.08, fade));
  const voices = VOICES.map((voice) => {
    const level = gain(context, 0, panned(context, voice.pan, fade));
    return { ...voice, level, band: filter(context, 'bandpass', voice.hz, 4, level) };
  });
  return {
    beds: [
      bed(kit, kit.brown, 0.2, murmur),
      ...voices.map((voice, index) => bed(kit, kit.white, 0.37 * index, voice.band)),
    ],
    fill: (start, window) => {
      const random = seeded(SEEDS.crowd + window * 7919);
      for (const voice of voices) {
        for (const at of beats(random, 0.12, 0.3)) {
          // Now and then a voice pauses; else a syllable, its vowel a little off the last.
          const loud = random() < 0.2 ? 0 : 0.04 + random() * 0.1;
          voice.level.gain.setTargetAtTime(loud, start + at, 0.04);
          voice.band.frequency.setTargetAtTime(
            voice.hz * (0.85 + random() * 0.3),
            start + at,
            0.05,
          );
        }
      }
    },
  };
}

function night(kit: NoiseKit, fade: GainNode): Parts {
  const { context } = kit;
  const breeze = filter(context, 'lowpass', 450, 0.7, gain(context, 0.07, fade));
  return {
    beds: [bed(kit, kit.brown, 0.9, breeze)],
    fill: (start, window) => {
      const seed = SEEDS.night + window * 7919;
      // Two crickets, one nearer, each at its own pitch.
      for (const event of chirps(seed, 1)) chirp(context, event, start + event.at, 4300, fade);
      for (const event of chirps(seed + 1, 1))
        chirp(context, { ...event, loudness: event.loudness * 0.6 }, start + event.at, 4750, fade);
    },
  };
}

const BUILDERS: Readonly<Record<Ambience, (kit: NoiseKit, fade: GainNode) => Parts>> = {
  rain,
  wind,
  fire,
  crowd,
  night,
};

/** Builds a soundscape into `out`, silent until its fade rises. */
export function soundscape(kit: NoiseKit, ambience: Ambience, out: AudioNode): Soundscape {
  const fade = gain(kit.context, 0, out);
  const parts = BUILDERS[ambience](kit, fade);
  return {
    ambience,
    fade,
    fill: parts.fill,
    stop: (at) => {
      for (const source of parts.beds) source.stop(at);
      const first = parts.beds[0];
      if (first) {
        first.onended = () => {
          fade.disconnect();
        };
      }
    },
  };
}
