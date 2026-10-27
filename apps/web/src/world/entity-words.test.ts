import { translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru.ts';
import { distinctNames, statusWord, unidentifiedName } from './entity-words.ts';

const english = (key: string, params?: Readonly<Record<string, string | number>>) =>
  translate('en', key, params);
const russian = (key: string, params?: Readonly<Record<string, string | number>>) =>
  translate('ru', key, params);

describe('entity words (Gate 06 retest)', () => {
  it('names an unidentified place as the places list does, in scene, details and actions alike', () => {
    expect(unidentifiedName(russian, 'location')).toBe('Неопознанное место');
    expect(unidentifiedName(russian, 'creature')).toBe('Неопознанное существо');
    expect(unidentifiedName(russian, 'item')).toBe('Неопознанный объект (предмет)');
    expect(unidentifiedName(english, 'location')).toBe('Unidentified location');
    expect(unidentifiedName(english, 'item')).toBe('Unidentified item');
  });

  it('calls only the living alive', () => {
    expect(statusWord(russian, 'item', 'active')).toBe('на месте');
    expect(statusWord(russian, 'feature', 'active')).toBe('на месте');
    expect(statusWord(russian, 'npc', 'active')).toBe('жив');
    expect(statusWord(russian, 'item', 'destroyed')).toBe('уничтожен');
    expect(statusWord(english, 'item', 'active')).toBe('in place');
    expect(statusWord(english, 'creature', 'dead')).toBe('dead');
  });

  it('calls an unnamed person a stranger, never an unidentified object (Stage 360)', () => {
    expect(unidentifiedName(russian, 'npc')).toBe('Незнакомец');
    expect(unidentifiedName(russian, 'character')).toBe('Незнакомец');
    expect(unidentifiedName(english, 'npc')).toBe('Stranger');
  });

  it('tells apart entities of one name by kind, then by number (Stage 360)', () => {
    const directory = [
      { entityId: 'guild-hall', kind: 'location', name: 'Торговая гильдия' },
      { entityId: 'guild', kind: 'faction', name: 'Торговая гильдия' },
      { entityId: 'goblin-a', kind: 'creature', name: 'Гоблин-налётчик' },
      { entityId: 'mira-vale', kind: 'npc', name: 'Мира Вейл' },
      { entityId: 'goblin-b', kind: 'creature', name: 'Гоблин-налётчик' },
    ] as const;
    expect(Object.fromEntries(distinctNames(russian, directory))).toEqual({
      'guild-hall': 'Торговая гильдия (место)',
      guild: 'Торговая гильдия (фракция)',
      'goblin-a': 'Гоблин-налётчик 1',
      'mira-vale': 'Мира Вейл',
      'goblin-b': 'Гоблин-налётчик 2',
    });
    // Where the kind stands beside the name (the Journal), only the number is added.
    expect(distinctNames(russian, directory, { kindShown: true }).get('guild')).toBe(
      'Торговая гильдия',
    );
    expect(distinctNames(english, directory).get('goblin-b')).toBe('Гоблин-налётчик 2');
  });
});
