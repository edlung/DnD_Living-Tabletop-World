import { translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru.ts';
import { statusWord, unidentifiedName } from './entity-words.ts';

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
});
