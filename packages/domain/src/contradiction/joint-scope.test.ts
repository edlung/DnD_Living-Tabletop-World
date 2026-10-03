import type { KnowledgeScope } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { EMPTY_WORLD_STATE, type WorldState } from '../kernel/state.ts';
import { jointScope } from './joint-scope.ts';

/** The ADR 0014 §2 table, row by row. `c1` is in the party, `c2` is not. */
const state: WorldState = { ...EMPTY_WORLD_STATE, roster: new Map([['c1', 'player-1']]) };
const PUBLIC: KnowledgeScope = { kind: 'PUBLIC' };
const PARTY: KnowledgeScope = { kind: 'PARTY' };
const c = (characterId: string): KnowledgeScope => ({ kind: 'CHARACTER', characterId });
const n = (npcId: string): KnowledgeScope => ({ kind: 'NPC', npcId });
const TRUTH: KnowledgeScope = { kind: 'WORLD_TRUTH' };
const DM: KnowledgeScope = { kind: 'DM' };

describe('jointScope', () => {
  it.each([
    [PUBLIC, PUBLIC, PUBLIC],
    [PUBLIC, PARTY, PARTY],
    [PUBLIC, c('c2'), c('c2')],
    [PUBLIC, n('n1'), n('n1')],
    [PARTY, PARTY, PARTY],
    [PARTY, c('c1'), c('c1')],
    [PARTY, c('c2'), null],
    [c('c1'), c('c1'), c('c1')],
    [c('c1'), c('c2'), null],
    [n('n1'), n('n1'), n('n1')],
    [n('n1'), n('n2'), null],
    [PARTY, n('n1'), null],
    [c('c1'), n('n1'), null],
    [TRUTH, PUBLIC, null],
    [TRUTH, TRUTH, null],
    [DM, PARTY, null],
    [DM, DM, null],
  ])('%o + %o → %o', (a, b, expected) => {
    expect(jointScope(state, a, b)).toEqual(expected);
    expect(jointScope(state, b, a)).toEqual(expected);
  });
});
