import {
  KERNEL_COMMAND_TYPES,
  type DmAuthoringEntry,
  type DmSubstitutionEntry,
  type DmWorldEntry,
  type EntityRef,
} from '@ltw/contracts';
import { russianEntry, translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru.ts';
import '../i18n/ru-play.ts';
import '../i18n/ru-visual.ts';
import {
  describeSubstitution,
  entryDetails,
  entryStatus,
  entryTitle,
  STEP_TEXT,
} from './history-text.ts';

const en = (key: string, params?: Record<string, string | number>) => translate('en', key, params);
const ru = (key: string, params?: Record<string, string | number>) => translate('ru', key, params);

const directory: EntityRef[] = [
  { entityId: 'creature-10fb59d4', kind: 'creature', name: 'Goblin Raider' },
  { entityId: 'north-gate', kind: 'location', name: 'North Gate' },
];

const elowen: EntityRef = {
  entityId: 'elowen-starwhisper',
  kind: 'character',
  name: 'Elowen Starwhisper',
};

const common = {
  commandId: 'http:dm-ravenford:shot',
  sequence: 120,
  worldTime: 36_000,
  recordedAt: '2026-10-15T20:00:00.000Z',
  status: 'COMMITTED' as const,
  undo: { possible: true } as const,
};

const shot: DmSubstitutionEntry = {
  ...common,
  kind: 'substitution',
  character: elowen,
  command: {
    type: 'Attack',
    combatantId: 'elowen-starwhisper',
    attackId: 'longbow',
    targetId: 'creature-10fb59d4',
  },
  reason: { reason: 'asked', note: 'Back in five' },
};

const tomas: DmAuthoringEntry = {
  ...common,
  commandId: 'authoring.p1',
  kind: 'authoring',
  proposalId: 'p1',
  summary: 'Tomas Reed guards North Gate.',
};

const dayTwo: DmWorldEntry = {
  ...common,
  commandId: 'http:dm-ravenford:day-two',
  worldTime: 122_400,
  kind: 'world',
  change: { kind: 'time', from: 36_000, to: 122_400 },
};

const toRain = {
  kind: 'weather',
  location: { entityId: 'market-square', kind: 'location', name: 'Market Square' },
  from: 'clear',
  to: 'rain',
} as const;

const rain: DmWorldEntry = {
  ...common,
  commandId: 'http:dm-ravenford:rain',
  kind: 'world',
  change: toRain,
};

describe('the DM history in words', () => {
  it('says who the DM acted as, what was done, why and when', () => {
    expect(entryTitle(en, shot, directory)).toBe(
      'Acting as Elowen Starwhisper: Attacked Goblin Raider',
    );
    expect(entryDetails(en, shot)).toBe('The player asked the DM: “Back in five” · Day 1 · 10:00');
    expect(entryDetails(en, { ...shot, reason: null })).toBe(
      'No reason was recorded · Day 1 · 10:00',
    );
    expect(entryDetails(en, { ...shot, reason: { reason: 'absent', note: null } })).toBe(
      'The player is absent · Day 1 · 10:00',
    );
    expect(entryStatus(en, shot)).toBe('In effect');
    expect(entryStatus(en, { ...shot, status: 'UNDONE', undo: null })).toBe('Undone');
  });

  it('shows an authoring commit by its summary', () => {
    expect(entryTitle(en, tomas, directory)).toBe('Tomas Reed guards North Gate.');
    expect(entryDetails(en, tomas)).toBe('Authoring · Day 1 · 10:00');
    expect(entryStatus(en, tomas)).toBe('Added to the world');
  });

  it('shows a time or weather change from what it was to what it became', () => {
    expect(entryTitle(en, dayTwo, directory)).toBe('Time: Day 1 · 10:00 → Day 2 · 10:00');
    expect(entryDetails(en, dayTwo)).toBe('World time · Day 2 · 10:00');
    expect(entryStatus(en, dayTwo)).toBe('In effect');
    expect(entryTitle(en, rain, directory)).toBe('Weather at Market Square: clear → rain');
    expect(entryDetails(en, rain)).toBe('Weather · Day 1 · 10:00');
    const first = { ...toRain, from: null };
    expect(entryTitle(en, { ...rain, change: first }, directory)).toBe(
      'Weather at Market Square: not set → rain',
    );
    expect(entryTitle(ru, dayTwo, directory)).toBe('Время: День 1 · 10:00 → День 2 · 10:00');
    expect(entryDetails(ru, dayTwo)).toBe('Время в мире · День 2 · 10:00');
    expect(entryTitle(ru, rain, directory)).toBe('Погода (Market Square): ясно → дождь');
    expect(entryTitle(ru, { ...rain, change: first }, directory)).toBe(
      'Погода (Market Square): не задана → дождь',
    );
    expect(entryDetails(ru, rain)).toBe('Погода · День 1 · 10:00');
  });

  it('describes every player command the DM may issue for a character', () => {
    const id = 'elowen-starwhisper';
    const said = (command: DmSubstitutionEntry['command']) =>
      describeSubstitution(en, command, directory);
    expect(said({ type: 'EndTurn', combatantId: id })).toBe('Ended the turn');
    expect(
      said({ type: 'CastSpell', combatantId: id, spellId: 'fireball', point: { x: 1, y: 2 } }),
    ).toBe('Cast fireball');
    expect(
      said({
        type: 'CastSpell',
        combatantId: id,
        spellId: 'hunters-mark',
        targetId: 'creature-10fb59d4',
      }),
    ).toBe('Cast hunters mark on Goblin Raider');
    expect(said({ type: 'MoveCombatant', combatantId: id, path: [{ x: 3, y: 6 }] })).toBe(
      'Moved to 3, 6',
    );
    expect(
      said({ type: 'UseReaction', combatantId: id, windowId: 'w', reaction: 'counterspell' }),
    ).toBe('Cast Counterspell as a reaction');
    expect(said({ type: 'DeclineReaction', combatantId: id, windowId: 'w' })).toBe('Let it happen');
    expect(said({ type: 'EnterLocation', characterId: id, locationId: 'north-gate' })).toBe(
      'Went to North Gate',
    );
    expect(
      said({ type: 'AskAbout', characterId: id, npcId: 'mira-vale', topicId: 'guild-caravan' }),
    ).toBe('Asked mira vale about guild caravan');
    expect(
      said({ type: 'ExamineEntity', characterId: id, entityId: 'north-gate', method: 'inspect' }),
    ).toBe('Examined North Gate');
  });

  it('names every command type as a step, in English and in Russian', () => {
    expect(Object.keys(STEP_TEXT).sort()).toEqual([...KERNEL_COMMAND_TYPES].sort());
    for (const type of KERNEL_COMMAND_TYPES) {
      expect(russianEntry(STEP_TEXT[type]), type).toBeDefined();
    }
    expect(ru(STEP_TEXT.AskAbout)).toBe('вопрос');
  });

  it('reads in Russian with the names as given', () => {
    expect(entryTitle(ru, shot, directory)).toBe(
      'За игрока (Elowen Starwhisper): Атака: Goblin Raider',
    );
    expect(entryDetails(ru, shot)).toBe('Игрок попросил мастера: «Back in five» · День 1 · 10:00');
  });
});
