import type { CheckRequestView, EncounterView } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { newWaits, waitsOf } from './waits.ts';

/**
 * What the table waits for from a player (docs/adr/0044-online-play.md §3): read from the server's
 * views, keyed so that a new turn, window, request or rest is news and the same one is not.
 */
const ELOWEN = 'elowen-starwhisper';

function encounter(change: Partial<EncounterView> = {}): EncounterView {
  return {
    encounterId: 'ambush',
    round: 2,
    currentCombatantId: ELOWEN,
    order: [ELOWEN, 'raider'],
    battlefield: {} as EncounterView['battlefield'],
    combatants: [
      { entity: { entityId: ELOWEN } },
      { entity: { entityId: 'raider' } },
    ] as unknown as EncounterView['combatants'],
    reactionWindow: null,
    ...change,
  };
}

const request = (requestId: string, change: Partial<CheckRequestView> = {}): CheckRequestView => ({
  requestId,
  groupId: null,
  characterId: ELOWEN,
  check: { kind: 'skill', skill: 'perception' },
  mode: 'normal',
  status: 'open',
  at: '2026-11-02T10:00:00.000Z',
  ...change,
});

const none = { requests: [], rest: null, restsTaken: new Set<string>() };

describe('what the table waits for', () => {
  it('waits for nothing from someone who acts as no character', () => {
    expect(
      waitsOf({ ...none, encounter: encounter(), actorId: null, requests: [request('r1')] }),
    ).toEqual([]);
  });

  it('waits for the player’s turn, keyed by the fight and the round', () => {
    expect(waitsOf({ ...none, encounter: encounter(), actorId: ELOWEN })).toEqual([
      { key: 'turn:ambush:2', kind: 'turn' },
    ]);
    expect(
      waitsOf({ ...none, encounter: encounter({ currentCombatantId: 'raider' }), actorId: ELOWEN }),
    ).toEqual([]);
    // A character not in the fight has no turn there.
    expect(
      waitsOf({
        ...none,
        encounter: encounter({ currentCombatantId: 'brann' }),
        actorId: 'brann',
      }),
    ).toEqual([]);
  });

  it('waits for a reaction only when the window asks this player', () => {
    const asked = encounter({
      currentCombatantId: 'raider',
      reactionWindow: {
        windowId: 'w1',
        choices: [{}],
      } as unknown as EncounterView['reactionWindow'],
    });
    expect(waitsOf({ ...none, encounter: asked, actorId: ELOWEN })).toEqual([
      { key: 'reaction:w1', kind: 'reaction' },
    ]);
    const others = encounter({
      currentCombatantId: 'raider',
      reactionWindow: { windowId: 'w1', choices: [] } as unknown as EncounterView['reactionWindow'],
    });
    expect(waitsOf({ ...none, encounter: others, actorId: ELOWEN })).toEqual([]);
  });

  it('waits for each open check asked of this character, never one answered or another’s', () => {
    const requests = [
      request('r1'),
      request('r2', { status: 'rolled' }),
      request('r3', { characterId: 'brann' }),
      request('r4', { status: 'cancelled' }),
    ];
    expect(waitsOf({ ...none, encounter: null, actorId: ELOWEN, requests })).toEqual([
      { key: 'check:r1', kind: 'check' },
    ]);
  });

  it('waits for a short rest until the player has gone to it, and never during a fight', () => {
    const rest = {
      restId: 'rest-1',
      kind: 'short',
      startedAt: '2026-11-02T10:00:00.000Z',
    } as const;
    expect(waitsOf({ ...none, encounter: null, actorId: ELOWEN, rest })).toEqual([
      { key: 'rest:rest-1', kind: 'rest' },
    ]);
    expect(
      waitsOf({ ...none, encounter: null, actorId: ELOWEN, rest, restsTaken: new Set(['rest-1']) }),
    ).toEqual([]);
    expect(
      waitsOf({
        ...none,
        encounter: encounter({ currentCombatantId: 'raider' }),
        actorId: ELOWEN,
        rest,
      }),
    ).toEqual([]);
  });

  it('calls news only what was not waiting before', () => {
    const waits = waitsOf({
      ...none,
      encounter: encounter(),
      actorId: ELOWEN,
      requests: [request('r1'), request('r2')],
    });
    expect(newWaits(new Set(['turn:ambush:2', 'check:r1']), waits)).toEqual([
      { key: 'check:r2', kind: 'check' },
    ]);
  });

  it('waits for each handout given since the table was first read, until it is opened', () => {
    expect(
      waitsOf({ ...none, encounter: null, actorId: ELOWEN, handouts: [{ handoutId: 'h1' }] }),
    ).toEqual([{ key: 'handout:h1', kind: 'handout' }]);
  });

  it('waits for the turn of a creature the player’s character commands', () => {
    const commanded = encounter({
      currentCombatantId: 'worg',
      combatants: [
        { entity: { entityId: ELOWEN } },
        { entity: { entityId: 'worg' }, commandedBy: { entityId: ELOWEN, name: 'Elowen' } },
      ] as unknown as EncounterView['combatants'],
    });
    expect(waitsOf({ ...none, encounter: commanded, actorId: ELOWEN })).toEqual([
      { key: 'turn:ambush:2:worg', kind: 'turn' },
    ]);
  });
});
