import { describe, expect, it } from 'vitest';

import { AmbiencePlayer, DUCKED, FADE_SECONDS } from './ambience.ts';
import { chirps, crackles, raindrops } from './schedule.ts';
import { FakeAudioContext as Context, Gain, RATE } from './testing/fake-audio.ts';

/**
 * The ambience as its graph (docs/adr/0059-atmosphere.md §1): what plays, when and how loud,
 * through the recording stand-in for the audio context.
 */
const DROP = Math.round(0.03 * RATE);
const POP = Math.round(0.012 * RATE);

function player() {
  const context = new Context();
  const out = new Gain();
  const ambience = new AmbiencePlayer(context.audio, out as unknown as AudioNode);
  return { context, out, ambience };
}

/** The moments the schedule gives the first three windows, at their times. */
const due = (make: (seed: number, seconds: number) => { readonly at: number }[], seed: number) =>
  [0, 1, 2].flatMap((window) => make(seed + window * 7919, 1).map((event) => window + event.at));

describe('the table’s ambience', () => {
  it('plays the rain’s drops and the fire’s pops as the schedule has them, a few seconds ahead', () => {
    const rain = player();
    rain.ambience.play('rain');
    expect(rain.context.sources(DROP).map((drop) => drop.started)).toEqual(due(raindrops, 11));
    // Its beds loop from the start: the hiss and the patter.
    expect(rain.context.sources().filter((source) => source.loop)).toHaveLength(2);

    const fire = player();
    fire.ambience.play('fire');
    expect(fire.context.sources(POP).map((pop) => pop.started)).toEqual(due(crackles, 37));
  });

  it('gives the night two crickets, each pulse a short tone', () => {
    const night = player();
    night.ambience.play('night');
    const tones = night.context.tones();
    const pulses = [0, 1, 2].reduce(
      (sum, window) =>
        sum + chirps(53 + window * 7919, 1).length + chirps(54 + window * 7919, 1).length,
      0,
    );
    expect(tones).toHaveLength(pulses);
    for (const tone of tones) expect(tone.stopped).toBeCloseTo((tone.started ?? 0) + 0.05);
  });

  it('moves the wind’s gusts and the crowd’s voices with every window', () => {
    for (const ambience of ['wind', 'crowd'] as const) {
      const screen = player();
      screen.ambience.play(ambience);
      const moving = screen.context.nodes.filter(
        (node) => node instanceof Gain && node.gain.events.some((event) => event.kind === 'target'),
      );
      expect(moving.length).toBeGreaterThan(0);
    }
  });

  it('fades the next soundscape in over the last, then lets the last go', () => {
    const { context, ambience } = player();
    ambience.play('rain');
    const beds = context.sources().filter((source) => source.loop);
    context.currentTime = 10;
    ambience.play('fire');
    expect(ambience.ambience).toBe('fire');
    for (const bed of beds) expect(bed.stopped).toBeCloseTo(10 + FADE_SECONDS + 0.05);
    const fades = context.nodes.filter(
      (node): node is Gain =>
        node instanceof Gain && node.gain.events.some((event) => event.kind === 'ramp'),
    );
    const [rainFade, fireFade] = fades;
    expect(rainFade?.gain.events.at(-1)).toEqual({
      kind: 'ramp',
      value: 0,
      at: 10 + FADE_SECONDS,
    });
    expect(fireFade?.gain.events).toEqual([
      { kind: 'set', value: 0, at: 10 },
      { kind: 'ramp', value: 1, at: 10 + FADE_SECONDS },
    ]);
    // Once the last's beds end, its fade leaves the output.
    beds[0]?.onended?.();
    expect(rainFade?.disconnected).toBe(true);
  });

  it('plays on when asked for what plays, and is silent for none', () => {
    const { context, ambience } = player();
    ambience.play('wind');
    const built = context.nodes.length;
    ambience.play('wind');
    expect(context.nodes).toHaveLength(built);
    ambience.play(null);
    expect(ambience.ambience).toBeNull();
    ambience.fill();
    expect(context.nodes).toHaveLength(built);
  });

  it('sits at half the dice’s loudness at this screen’s volume, lower beneath music', () => {
    const { out, context, ambience } = player();
    const duck = context.nodes.find((node): node is Gain => node.outputs.includes(out));
    const level = context.nodes.find(
      (node): node is Gain => duck !== undefined && node.outputs.includes(duck),
    );
    expect(level?.gain.value).toBe(0);
    ambience.volume(0.8);
    expect(level?.gain.events).toEqual([{ kind: 'target', value: 0.4, at: 0 }]);
    ambience.duck(true);
    ambience.duck(false);
    expect(duck?.gain.events.map((event) => event.value)).toEqual([DUCKED, 1]);
  });

  it('skips what a sleeping screen missed and plays on from now', () => {
    const { context, ambience } = player();
    ambience.play('rain');
    const before = context.sources(DROP).length;
    context.currentTime = 30;
    ambience.fill();
    const later = context.sources(DROP).slice(before);
    expect(later.length).toBeGreaterThan(0);
    for (const drop of later) expect(drop.started).toBeGreaterThanOrEqual(30.05);
  });
});
