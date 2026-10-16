import type { EncounterCombatantView } from '@ltw/contracts';
import { translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../../i18n/ru.ts';
import '../../i18n/ru-play.ts';
import '../../i18n/ru-visual.ts';
import { squareName, type SquareFacts } from './square-name.ts';

const english = (key: string, params?: Readonly<Record<string, string | number>>) =>
  translate('en', key, params);
const russian = (key: string, params?: Readonly<Record<string, string | number>>) =>
  translate('ru', key, params);

const elowen: EncounterCombatantView = {
  entity: { entityId: 'elowen-starwhisper', kind: 'character', name: 'Elowen Starwhisper' },
  side: 'party',
  position: { x: 2, y: 6 },
  state: 'up',
  conditions: [],
  hitPoints: { current: 78, max: 78 },
};
const raider: EncounterCombatantView = {
  entity: { entityId: 'goblin-raider-1', kind: 'creature', name: null },
  side: 'hostile',
  position: { x: 8, y: 4 },
  state: 'down',
  conditions: ['prone', 'unconscious'],
};
const empty: SquareFacts = {
  occupant: null,
  you: false,
  difficult: false,
  cover: null,
  inArea: false,
};

describe('the name of a board square', () => {
  it('is its coordinates alone when nothing is there', () => {
    expect(squareName(english, { x: 0, y: 0 }, empty)).toBe('Square 0, 0');
  });

  it('says who stands there, terrain, cover and a previewed area, as the journeys read them', () => {
    const you = squareName(english, { x: 2, y: 6 }, { ...empty, occupant: elowen, you: true });
    expect(you).toBe('Square 2, 6: Elowen Starwhisper (you), party, 78 / 78 HP');
    expect(you).toMatch(/^Square 2, 6(:|$)/);
    const raiderName = squareName(
      english,
      { x: 8, y: 4 },
      {
        ...empty,
        occupant: raider,
        cover: 'half',
        inArea: true,
      },
    );
    expect(raiderName).toBe(
      'Square 8, 4: goblin-raider-1, hostile, down, prone, unconscious; half cover; in the area',
    );
    expect(squareName(english, { x: 0, y: 9 }, { ...empty, difficult: true })).toBe(
      'Square 0, 9: difficult terrain',
    );
    expect(squareName(english, { x: 3, y: 2 }, { ...empty, cover: 'total' })).toBe(
      'Square 3, 2: total cover',
    );
  });

  it('never marks an empty square as in the area', () => {
    expect(squareName(english, { x: 5, y: 5 }, { ...empty, inArea: true })).toBe('Square 5, 5');
  });

  it('speaks Russian in a Russian campaign, names and IDs as published', () => {
    expect(
      squareName(
        russian,
        { x: 8, y: 4 },
        {
          ...empty,
          occupant: raider,
          difficult: true,
          cover: 'three-quarters',
        },
      ),
    ).toBe(
      'Клетка 8, 4: goblin-raider-1, враждебная, упал, сбит с ног, без сознания; трудная местность; укрытие на три четверти',
    );
    expect(squareName(russian, { x: 2, y: 6 }, { ...empty, occupant: elowen, you: true })).toBe(
      'Клетка 2, 6: Elowen Starwhisper (вы), отряд, 78 / 78 ОЗ',
    );
  });
});
