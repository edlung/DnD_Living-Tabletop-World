import { describe, expect, it } from 'vitest';

import { readCheckLine } from './check-line.ts';

const options = (line: string) =>
  readCheckLine(line).options.map((o) => {
    const what = o.check.kind === 'skill' ? o.check.skill : `${o.check.kind}:${o.check.ability}`;
    return `${what}@${String(o.dc)}${o.group ? ' group' : ''}`;
  });

describe('a scene check line read as fields', () => {
  it.each([
    ['Харизма (Убеждение), СЛ 13: успех позволяет унести одеяла.', ['persuasion@13']],
    ['Мудрость (Проницательность), Сл 12: успех замечает.', ['insight@12']],
    ['Интеллект (Расследование), DC 12: успех сразу связывает.', ['investigation@12']],
    ['Убеждение СЛ 12: Харвен сам отправляет сотню обратно.', ['persuasion@12']],
    ['Восприятие или расследование DC 10.', ['perception@10', 'investigation@10']],
    ['Атлетика СЛ 12', ['athletics@12']],
    ['Интеллект DC 13 помогает точно выбрать угол.', ['ability:int@13']],
    [
      'Интеллект DC 12 помогает показать форму; Сила DC 12 удерживает канат.',
      ['ability:int@12', 'ability:str@12'],
    ],
    ['Таблички читаются без броска. Религия СЛ 12: свет шевелится.', ['religion@12']],
    [
      'Ловкость (Акробатика), Сл 13, либо Ловкость (Ловкость рук), Сл 13.',
      ['acrobatics@13', 'sleight-of-hand@13'],
    ],
    ['Мудрость (Внимательность или Проницательность) СЛ 11.', ['perception@11', 'insight@11']],
    ['Спасбросок Силы или Ловкости СЛ 11 — удержать книжку.', ['save:str@11', 'save:dex@11']],
    ['Ловкость (Скрытность) группой СЛ 12 (при тревоге 5+ — СЛ 14).', ['stealth@12 group']],
    ['Сила (Атлетика) группой СЛ 12 — транспорт проходит.', ['athletics@12 group']],
  ])('%s', (line, expected) => {
    const read = readCheckLine(line);
    expect(options(line)).toEqual(expected);
    expect(read.roll).toBe('asked');
    expect(read.line).toBe(line);
  });

  it.each([
    'Броска нет. Если стол хочет, можно отыграть короткий разговор.',
    'Без проверок. Личная сцена не измеряет искренность.',
    'Броски не нужны. Ошибка приводит к доброй реплике.',
    'Проверки нет: она говорит сама, когда её спрашивают.',
    'Бросок для эпилога не нужен: игрок выбирает действия героя.',
    'План не проверяется броском. Отмечайте только реальные ресурсы.',
  ])('says there is no roll: %s', (line) => {
    expect(readCheckLine(line)).toEqual({ line, roll: 'none', options: [] });
  });

  it.each([
    // A tool, a craft, a word the product has no check for: the difficulty is not attached.
    'Сложная настройка — подходящий инструмент СЛ 12.',
    'Ремесло СЛ 12: помощник у мехов успевает за день.',
    'Ловкость (инструменты плотника) СЛ 13 — течь заделана.',
    // Skills in another case are not guessed.
    'Один бросок Акробатики, Атлетики или Ловкости рук СЛ 11.',
    // No difficulty and no statement about a roll.
    'Используйте подготовленный бой и штатные команды.',
    'Предел — 3 ряда за ход для всех.',
  ])('is left as written: %s', (line) => {
    expect(readCheckLine(line)).toEqual({ line, roll: 'unread', options: [] });
  });

  it('keeps what it can read and leaves the rest of a mixed line', () => {
    expect(options('Ремесло или Атлетика СЛ 12: цепь остывает раньше.')).toEqual([]);
    expect(options('Природа DC 11 помогает; подходящий инструмент СЛ 14.')).toEqual(['nature@11']);
    expect(options('Убеждение СЛ 12, затем Убеждение СЛ 12.')).toEqual(['persuasion@12']);
    expect(options('Анализ СЛ 99.')).toEqual([]);
  });
});
