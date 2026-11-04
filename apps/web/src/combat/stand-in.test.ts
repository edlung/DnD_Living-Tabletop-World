import type { EncounterView } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { standInChoices, standInReason } from './stand-in.ts';

const combatant = (entityId: string, kind: 'character' | 'creature', name: string | null) => ({
  entity: { entityId, kind, name },
  side: kind === 'character' ? ('party' as const) : ('hostile' as const),
  position: { x: 0, y: 0 },
  state: 'up' as const,
  conditions: [],
});

const encounter = (changes: Partial<EncounterView> = {}): EncounterView => ({
  encounterId: 'e1',
  locationId: 'old-trade-road',
  round: 1,
  currentCombatantId: 'elowen-starwhisper',
  order: ['elowen-starwhisper', 'seren-ashgrove', 'creature-ae08be99'],
  battlefield: { width: 16, height: 12, difficult: [], cover: [] },
  combatants: [
    combatant('elowen-starwhisper', 'character', 'Elowen Starwhisper'),
    combatant('seren-ashgrove', 'character', 'Seren Ashgrove'),
    combatant('creature-ae08be99', 'creature', 'Goblin Shaman'),
  ],
  reactionWindow: null,
  ...changes,
});

describe('standInChoices', () => {
  it('offers the character whose turn it is, to skip or to act as', () => {
    expect(standInChoices(encounter())).toEqual([
      { characterId: 'elowen-starwhisper', name: 'Elowen Starwhisper', current: true },
    ]);
  });

  it('offers nothing on a creature’s turn, but a character the open window waits on', () => {
    expect(standInChoices(encounter({ currentCombatantId: 'creature-ae08be99' }))).toEqual([]);
    const waiting = encounter({
      currentCombatantId: 'creature-ae08be99',
      reactionWindow: {
        windowId: 'w1',
        trigger: {
          kind: 'spell',
          caster: { entityId: 'creature-ae08be99', kind: 'creature', name: 'Goblin Shaman' },
          components: ['V', 'S'],
        },
        candidates: [
          { entityId: 'elowen-starwhisper', response: 'declined' },
          { entityId: 'seren-ashgrove', response: 'pending' },
        ],
        choices: [],
      },
    });
    expect(standInChoices(waiting)).toEqual([
      { characterId: 'seren-ashgrove', name: 'Seren Ashgrove', current: false },
    ]);
  });

  it('never offers a dead character', () => {
    const fallen = encounter({
      combatants: [
        { ...combatant('elowen-starwhisper', 'character', 'Elowen Starwhisper'), state: 'dead' },
      ],
    });
    expect(standInChoices(fallen)).toEqual([]);
  });
});

describe('standInReason', () => {
  it('sends the note only when there is one', () => {
    const base = { characterId: 'elowen-starwhisper', name: 'Elowen Starwhisper' } as const;
    expect(standInReason({ ...base, reason: 'absent', note: null })).toEqual({
      characterId: 'elowen-starwhisper',
      reason: 'absent',
    });
    expect(standInReason({ ...base, reason: 'other', note: 'Back soon' })).toEqual({
      characterId: 'elowen-starwhisper',
      reason: 'other',
      note: 'Back soon',
    });
  });
});
