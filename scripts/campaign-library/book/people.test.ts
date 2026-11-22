import { describe, expect, it } from 'vitest';

import { nameStem, personFinder } from './people.ts';

const cast = [
  { key: 'marfa', name: 'Марфа Соболь' },
  { key: 'ilyr', name: 'Смотритель Ильр' },
  { key: 'tonya', name: 'Тоня' },
  { key: 'yuliy', name: 'Юлий Верес' },
  { key: 'runa', name: 'капитан Руна Вей' },
];
const corpus = 'У причала ждёт смотритель. Марфа машет рукой. Тонкий лёд держит.';

describe('people of the cast named in a page', () => {
  it('finds a name in its case forms and keeps the words as written', () => {
    const find = personFinder(cast, corpus);
    expect(
      find('Спросите Марфу: Марфа знает дорогу, а у Марфы есть ключ. С Марфой проще.'),
    ).toEqual([{ person: 'marfa', words: ['Марфа', 'Марфой', 'Марфу', 'Марфы'] }]);
    expect(find('Юлия нет дома; Юлию оставили записку. Рядом Тоня, а с Тоней — Руна.')).toEqual([
      { person: 'tonya', words: ['Тоней', 'Тоня'] },
      { person: 'yuliy', words: ['Юлию', 'Юлия'] },
      { person: 'runa', words: ['Руна'] },
    ]);
    expect(find('Соболь молчит. Ильра позвали к пульту.')).toEqual([
      { person: 'marfa', words: ['Соболь'] },
      { person: 'ilyr', words: ['Ильра'] },
    ]);
  });

  it('makes no link from a word the campaign also writes in lower case', () => {
    const find = personFinder(cast, corpus);
    expect(find('Смотритель выходит к гостям.')).toEqual([]);
  });

  it('makes no link from another word that only begins like a name', () => {
    const find = personFinder(cast, corpus);
    expect(find('Тонкий лёд. Рунами покрыта дверь. Марфуша смеётся. Вейка шумит.')).toEqual([]);
  });

  it('makes no link from a stem two people share', () => {
    const find = personFinder(
      [
        { key: 'elder', name: 'Анна Верес' },
        { key: 'younger', name: 'Ян Верес' },
      ],
      '',
    );
    expect(find('Верес открыл дверь. Анна молчит.')).toEqual([
      { person: 'elder', words: ['Анна'] },
    ]);
  });

  it('cuts a case ending and nothing more', () => {
    expect(['Марфа', 'Тоня', 'Юлий', 'Ильр', 'Соболь', 'Соболевский', 'Лю'].map(nameStem)).toEqual([
      'Марф',
      'Тон',
      'Юли',
      'Ильр',
      'Собол',
      'Соболевск',
      'Лю',
    ]);
  });
});
