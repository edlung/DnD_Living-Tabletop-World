import type { EncounterCombatantView, EncounterView } from '@ltw/contracts';
import { translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru.ts';
import { labelsOf } from './labels.ts';

const english = (key: string, params?: Readonly<Record<string, string | number>>) =>
  translate('en', key, params);
const russian = (key: string, params?: Readonly<Record<string, string | number>>) =>
  translate('ru', key, params);

const fighter = (
  entityId: string,
  name: string | null,
  position: { x: number; y: number },
): EncounterCombatantView => ({
  entity: { entityId, kind: name === null ? 'creature' : 'character', name },
  side: name === null ? 'hostile' : 'party',
  position,
  state: 'up',
  conditions: [],
});

/** The ambush as a player sees it: Elowen by name, four goblins without one. */
const ambush = (order: readonly string[]): EncounterView => ({
  encounterId: 'road-ambush',
  round: 1,
  currentCombatantId: 'elowen-starwhisper',
  order,
  battlefield: { width: 12, height: 10, difficult: [], cover: [] },
  combatants: [
    fighter('creature-ae08be99', null, { x: 9, y: 3 }),
    fighter('elowen-starwhisper', 'Elowen Starwhisper', { x: 2, y: 6 }),
    fighter('creature-589f6668', null, { x: 8, y: 6 }),
    fighter('creature-10fb59d4', null, { x: 6, y: 4 }),
    fighter('creature-6513bec0', null, { x: 9, y: 5 }),
  ],
  reactionWindow: null,
});

const ORDER = [
  'elowen-starwhisper',
  'creature-10fb59d4',
  'creature-589f6668',
  'creature-6513bec0',
  'creature-ae08be99',
];

describe('combatant labels', () => {
  it('number the unnamed in turn order and never show an ID', () => {
    const labelOf = labelsOf(ambush(ORDER), english);
    expect(ORDER.map(labelOf)).toEqual([
      'Elowen Starwhisper',
      'Unidentified creature 1',
      'Unidentified creature 2',
      'Unidentified creature 3',
      'Unidentified creature 4',
    ]);
    for (const id of ORDER) expect(labelOf(id)).not.toMatch(/goblin/);
  });

  it('stay the same whatever order the combatants arrive in', () => {
    const encounter = ambush(ORDER);
    const shuffled = { ...encounter, combatants: encounter.combatants.toReversed() };
    expect(ORDER.map(labelsOf(shuffled, english))).toEqual(ORDER.map(labelsOf(encounter, english)));
  });

  it('fall back to position (row, then column) for anyone the order does not list', () => {
    const labelOf = labelsOf(ambush(['elowen-starwhisper', 'creature-ae08be99']), english);
    expect(labelOf('creature-ae08be99')).toBe('Unidentified creature 1');
    // Unlisted: raider 1 stands on row 4, raider 3 on row 5, raider 2 on row 6.
    expect(labelOf('creature-10fb59d4')).toBe('Unidentified creature 2');
    expect(labelOf('creature-6513bec0')).toBe('Unidentified creature 3');
    expect(labelOf('creature-589f6668')).toBe('Unidentified creature 4');
  });

  it('keep every name the projection carries, as the DM receives them', () => {
    const encounter = ambush(ORDER);
    const named = {
      ...encounter,
      combatants: encounter.combatants.map((entry) => ({
        ...entry,
        entity: { ...entry.entity, name: entry.entity.name ?? 'Goblin Raider' },
      })),
    };
    expect(labelsOf(named, english)('creature-589f6668')).toBe('Goblin Raider');
  });

  it('speak Russian in a Russian campaign', () => {
    expect(labelsOf(ambush(ORDER), russian)('creature-ae08be99')).toBe('Неопознанное существо 4');
  });
});
