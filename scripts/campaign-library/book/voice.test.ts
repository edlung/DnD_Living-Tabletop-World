import { describe, expect, it } from 'vitest';

import { tieEncounters } from './encounters.ts';
import { voiceOf } from './voice.ts';

describe('whom a scene text speaks to', () => {
  it.each([
    'Предложите героям по очереди занять площадку.',
    'Тоня раскладывает формы. Пусть каждый игрок предложит один вопрос.',
    'Есть четыре знака. Используйте только подготовленный бой.',
    'Никса открывает журнал. Разделите действия между двумя группами.',
    'У ворот Руэ просит проверить имена; отряд решает сам.',
  ])('the DM: %s', (text) => {
    expect(voiceOf(text)).toBe('dm');
  });

  it.each([
    'Над причалом гаснут фонари. Вы слышите, как скрипит канат.',
    'Марфа открывает дверь: «Проходите, не стойте на ветру». В доме пахнет хлебом.',
  ])('the players: %s', (text) => {
    expect(voiceOf(text)).toBe('players');
  });
});

describe('which chapter a prepared encounter belongs to', () => {
  const chapters = [
    { key: 'one', number: 1, location: 'dock', text: 'Причал. Смотрители причала ждут.' },
    { key: 'two', number: 2, location: 'mill', text: 'Мельница.' },
    { key: 'three', number: 3, location: 'dock', text: 'Снова причал.' },
    { key: 'six', number: 6, location: 'yard', text: 'Двор.' },
  ];
  const fight = (key: string, location: string, trigger: string, title = 'Без имени') => ({
    key,
    title,
    location,
    trigger,
  });

  it('follows the first rule that names exactly one chapter', () => {
    const tied = tieEncounters(
      [
        fight('named', 'dock', 'Вечер 3, сцена 2. Едва Ефим сдался, поёт рожок.'),
        fight('ordinal', 'nowhere', 'Только по выбору стола в шестой встрече.'),
        fight('placed', 'mill', 'Только если игроки выбрали бой.'),
        fight('titled', 'dock', 'Только если игроки выбрали бой.', 'Смотрители причала'),
        fight('lost', 'dock', 'Только если игроки выбрали бой.'),
        fight('nowhere', 'dock', 'Только если игроки выбрали бой.'),
        fight('elsewhere', 'cellar', 'В финале.'),
      ],
      chapters,
      { chapter: 2, encounter: 'lost' },
    );
    expect(Object.fromEntries(tied.byChapter)).toEqual({
      three: ['named'],
      six: ['ordinal'],
      two: ['placed', 'lost'],
      one: ['titled'],
    });
    expect(tied.loose).toEqual(['nowhere', 'elsewhere']);
  });
});
