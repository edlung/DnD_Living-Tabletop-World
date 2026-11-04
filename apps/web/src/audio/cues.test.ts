import type { RollEntry, RollGroup } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { CUES, VOICES, cueFor, playCueInto } from './cues.ts';
import { FakeAudioContext, Gain } from './testing/fake-audio.ts';

/**
 * What came of a roll, as a sound (docs/adr/0059-atmosphere.md §2): which throw of which roll gets
 * which cue, and each cue's graph — its tones and noises, when they start and stop, how loud.
 */
const group = (change: Partial<RollGroup>): RollGroup => ({
  purpose: 'dice',
  dice: [{ sides: 20, value: 12 }],
  modifier: 0,
  total: 12,
  ...change,
});

const roll = (subject: RollEntry['subject'], groups: readonly RollGroup[]): RollEntry => ({
  rollId: 'table:1',
  roller: null,
  subject,
  groups,
  hidden: false,
  at: '2026-11-04T00:00:00.000Z',
});

describe('a roll’s cue', () => {
  it('is the attack’s hit, miss or critical, and none for its damage', () => {
    const attack = { kind: 'attack', attack: 'longsword' } as const;
    const damage = group({ purpose: 'damage' });
    expect(cueFor(roll(attack, [group({ purpose: 'attack', result: 'hit' }), damage]), 0)).toBe(
      'hit',
    );
    expect(cueFor(roll(attack, [group({ purpose: 'attack', result: 'hit' }), damage]), 1)).toBe(
      null,
    );
    expect(cueFor(roll(attack, [group({ purpose: 'attack', result: 'miss' })]), 0)).toBe('miss');
    expect(
      cueFor(roll(attack, [group({ purpose: 'attack', result: 'hit', critical: true })]), 0),
    ).toBe('critical');
  });

  it('is a check’s or a save’s success or failure, a spell’s shimmer, healing’s chord', () => {
    const check = { kind: 'skill', skill: 'stealth' } as const;
    expect(cueFor(roll(check, [group({ purpose: 'check', result: 'success' })]), 0)).toBe(
      'success',
    );
    expect(cueFor(roll({ kind: 'death-save' }, [group({ result: 'failure' })]), 0)).toBe('failure');
    const spell = { kind: 'spell', spellId: 'fireball' } as const;
    expect(cueFor(roll(spell, [group({ purpose: 'damage' })]), 0)).toBe('spell');
    expect(cueFor(roll(spell, [group({ purpose: 'healing' })]), 0)).toBe('healing');
    // Free dice, initiative, a table's roll: their dice are heard, nothing more.
    expect(cueFor(roll({ kind: 'dice' }, [group({})]), 0)).toBeNull();
    expect(cueFor(roll({ kind: 'initiative' }, [group({ purpose: 'initiative' })]), 0)).toBeNull();
    expect(cueFor(roll({ kind: 'dice' }, [group({})]), 3)).toBeNull();
  });
});

describe('a cue’s sound', () => {
  it('plays every voice once, from the moment it is asked, and stops each', () => {
    for (const cue of CUES) {
      const context = new FakeAudioContext();
      context.currentTime = 5;
      const out = new Gain();
      playCueInto(context.audio, out as unknown as AudioNode, cue, 1);
      const sources = context.sources();
      expect(sources).toHaveLength(VOICES[cue].length);
      expect(context.tones()).toHaveLength(
        VOICES[cue].filter((voice) => voice.kind === 'tone').length,
      );
      for (const [index, source] of sources.entries()) {
        const voice = VOICES[cue][index];
        expect(source.started).toBeCloseTo(5.02 + (voice?.at ?? 0));
        expect(source.stopped).toBeCloseTo(5.02 + (voice?.at ?? 0) + (voice?.seconds ?? 0) + 0.02);
      }
    }
  });

  it('is as loud as the dice: their volume, under the shared limiter', () => {
    const context = new FakeAudioContext();
    const out = new Gain();
    playCueInto(context.audio, out as unknown as AudioNode, 'success', 0.5);
    const level = context.nodes.find((node): node is Gain => node.outputs.includes(out));
    expect(level?.gain.value).toBeCloseTo(0.4);
    // Each voice rises to its own level, then dies away to silence.
    const envelopes = context.nodes.filter(
      (node): node is Gain => node instanceof Gain && node.outputs.includes(level as Gain),
    );
    expect(envelopes).toHaveLength(2);
    for (const envelope of envelopes) {
      expect(envelope.gain.events.map((event) => event.kind)).toEqual(['set', 'ramp', 'exp']);
      expect(envelope.gain.events[1]?.value).toBe(0.25);
      expect(envelope.gain.events[2]?.value).toBe(0.0001);
    }
  });
});
