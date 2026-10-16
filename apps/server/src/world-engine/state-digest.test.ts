import { replay } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { seededEngine } from '../testing/ravenford-app.ts';
import { canonicalEncoding, stateDigest } from './state-digest.ts';

/** State digests for the restore drill (docs/adr/0037-deployment.md §4). */
describe('stateDigest', () => {
  it('is the same for the engine state and a fresh replay of its history', async () => {
    const snapshot = await (await seededEngine()).load('ravenford');
    if (snapshot === null) throw new Error('seed missing');

    expect(stateDigest(snapshot.state)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(stateDigest(replay(snapshot.history))).toBe(stateDigest(snapshot.state));
    expect(stateDigest(replay(snapshot.history, { untilSequence: 3 }))).not.toBe(
      stateDigest(snapshot.state),
    );
  });

  it('changes with any canonical value and ignores the order maps and sets were filled in', async () => {
    const snapshot = await (await seededEngine()).load('ravenford');
    if (snapshot === null) throw new Error('seed missing');
    const { state } = snapshot;
    const reversed = new Map([...state.entities].reverse());
    const [firstId, first] = [...state.entities][0] ?? [];
    if (firstId === undefined || first === undefined) throw new Error('no entity');
    const renamed = new Map(state.entities).set(firstId, { ...first, name: `${first.name}!` });

    expect(stateDigest({ ...state, entities: reversed })).toBe(stateDigest(state));
    expect(stateDigest({ ...state, usedIds: new Set([...state.usedIds].reverse()) })).toBe(
      stateDigest(state),
    );
    expect(stateDigest({ ...state, entities: renamed })).not.toBe(stateDigest(state));
    expect(stateDigest({ ...state, clock: state.clock + 1 })).not.toBe(stateDigest(state));
  });
});

describe('canonicalEncoding', () => {
  it('sorts object keys, omits undefined members and keeps array order', () => {
    expect(canonicalEncoding({ b: 1, a: [2, 1], c: undefined, d: null })).toBe(
      '{"a":[2,1],"b":1,"d":null}',
    );
  });

  it('keeps maps, sets, objects and arrays apart', () => {
    const encodings = [
      canonicalEncoding(new Map([['a', 1]])),
      canonicalEncoding({ a: 1 }),
      canonicalEncoding([['a', 1]]),
      canonicalEncoding(new Set(['a'])),
      canonicalEncoding(['a']),
      canonicalEncoding('a'),
    ];
    expect(new Set(encodings).size).toBe(encodings.length);
    expect(canonicalEncoding({ $map: [] })).not.toBe(canonicalEncoding(new Map()));
  });

  it('distinguishes values equality distinguishes', () => {
    expect(canonicalEncoding(0)).not.toBe(canonicalEncoding(-0));
    expect(canonicalEncoding('1')).not.toBe(canonicalEncoding(1));
    expect(canonicalEncoding(null)).not.toBe(canonicalEncoding('null'));
  });

  it.each([
    ['a function', () => undefined],
    ['a class instance', new Date(0)],
    ['NaN', Number.NaN],
    ['a big integer', 1n],
    ['an undefined array element', [undefined]],
    ['a hole', [1, , 2]], // eslint-disable-line no-sparse-arrays
    ['undefined', undefined],
  ])('refuses %s', (_label, value) => {
    expect(() => canonicalEncoding(value)).toThrow(TypeError);
  });
});
