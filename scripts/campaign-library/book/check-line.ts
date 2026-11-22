import type {
  Ability,
  Check,
  CampaignBookCheck,
  Skill,
} from '../../../packages/contracts/src/index.ts';

/**
 * A scene's check line read as fields (docs/adr/0074-dm-book.md §2.3). Only what the line states
 * in a form that cannot be misread becomes an option: a difficulty («DC 12», «СЛ 12», «Сл 12»)
 * with, right before it, an ability, a skill, an ability with its skill in brackets, a saving
 * throw, or several of these joined by «или»; «группой» before the difficulty makes it a group
 * check. Anything else stays the line as written.
 */
const ABILITY: Readonly<Record<string, Ability>> = {
  сила: 'str',
  ловкость: 'dex',
  телосложение: 'con',
  интеллект: 'int',
  мудрость: 'wis',
  харизма: 'cha',
};
const SAVE: Readonly<Record<string, Ability>> = {
  силы: 'str',
  ловкости: 'dex',
  телосложения: 'con',
  интеллекта: 'int',
  мудрости: 'wis',
  харизмы: 'cha',
};
const SKILL: Readonly<Record<string, Skill>> = {
  внимательность: 'perception',
  восприятие: 'perception',
  анализ: 'investigation',
  расследование: 'investigation',
  проницательность: 'insight',
  выживание: 'survival',
  магия: 'arcana',
  скрытность: 'stealth',
  атлетика: 'athletics',
  акробатика: 'acrobatics',
  'ловкость рук': 'sleight-of-hand',
  история: 'history',
  природа: 'nature',
  религия: 'religion',
  'уход за животными': 'animal-handling',
  'обращение с животными': 'animal-handling',
  медицина: 'medicine',
  обман: 'deception',
  запугивание: 'intimidation',
  выступление: 'performance',
  исполнение: 'performance',
  убеждение: 'persuasion',
};

const alt = (names: Readonly<Record<string, unknown>>) =>
  Object.keys(names)
    .sort((a, b) => b.length - a.length)
    .join('|');
const SK = alt(SKILL);
const AB = alt(ABILITY);
const START = '(?:^|[^а-яё])';
/** One subject at the end of the text before a difficulty, tried from the most specific. */
const TERMS: readonly { pattern: RegExp; read: (m: RegExpExecArray) => Check[] }[] = [
  {
    pattern: new RegExp(`${START}(?:${AB})\\s*\\(\\s*(${SK})(?:\\s+или\\s+(${SK}))?\\s*\\)$`),
    read: (m) => [m[1], m[2]].flatMap((name) => skill(name)),
  },
  {
    pattern: new RegExp(`${START}спасбросок\\s+(${alt(SAVE)})(?:\\s+или\\s+(${alt(SAVE)}))?$`),
    read: (m) =>
      [m[1], m[2]].flatMap((name): Check[] => {
        const ability = name === undefined ? undefined : SAVE[name];
        return ability ? [{ kind: 'save', ability }] : [];
      }),
  },
  { pattern: new RegExp(`${START}(${SK})$`), read: (m) => skill(m[1]) },
  {
    pattern: new RegExp(`${START}(${AB})$`),
    read: (m) => {
      const ability = ABILITY[m[1] ?? ''];
      return ability ? [{ kind: 'ability', ability }] : [];
    },
  },
];
function skill(name: string | undefined): Check[] {
  const id = name === undefined ? undefined : SKILL[name];
  return id ? [{ kind: 'skill', skill: id }] : [];
}

/** The checks named right before a difficulty, the last first; empty when the words are unknown. */
function subjects(before: string): { checks: Check[]; group: boolean } {
  const whole = before.toLowerCase().replace(/[\s,]+$/u, '');
  const group = /(?:^|[^а-яё])группой$/u.test(whole);
  return { checks: named(group ? whole.slice(0, -'группой'.length) : whole), group };
}
function named(before: string): Check[] {
  let rest = before.replace(/[\s,]+$/u, '');
  const found: Check[] = [];
  for (;;) {
    const term = TERMS.map((t) => ({ t, m: t.pattern.exec(rest) })).find((x) => x.m !== null);
    if (!term?.m) return [];
    found.unshift(...term.t.read(term.m));
    const kept = term.m[0].replace(/^[^а-яё]/u, '');
    rest = rest.slice(0, rest.length - kept.length).replace(/\s+$/u, '');
    const joined = /(?:\s+или|\s*\/|,\s*либо|\s+либо)$/u.exec(rest);
    if (!joined) return found;
    rest = rest.slice(0, rest.length - joined[0].length).replace(/[\s,]+$/u, '');
    // «…, СЛ 13, либо X СЛ 13»: the joiner leads back to the difficulty before, not to a word.
    if (rest === '') return found;
  }
}

const DIFFICULTY = /(?:DC|СЛ|Сл\.?)\s*(\d{1,2})(?!\d)/gu;
const NO_ROLL =
  /(?:^|[.!?]\s+)(?:Без броск|Без проверок|Броска нет|Бросков нет|Проверки нет|Проверок нет|Отдельной проверки нет|Броски не нужны|Бросок[^.]{0,60}не нужен|[^.]{0,40}не проверяется броском)/u;

export function readCheckLine(line: string): CampaignBookCheck {
  const options: CampaignBookCheck['options'] = [];
  let from = 0;
  let any = false;
  for (const match of line.matchAll(DIFFICULTY)) {
    any = true;
    const dc = Number(match[1]);
    const before = line.slice(from, match.index);
    from = match.index + match[0].length;
    if (dc < 1 || dc > 40) continue;
    const { checks, group } = subjects(before);
    for (const check of checks) {
      const same = options.some(
        (o) => o.dc === dc && JSON.stringify(o.check) === JSON.stringify(check),
      );
      if (!same && options.length < 8) options.push({ check, dc, ...(group ? { group } : {}) });
    }
  }
  const roll = options.length > 0 ? 'asked' : !any && NO_ROLL.test(line) ? 'none' : 'unread';
  return { line, roll, options };
}
