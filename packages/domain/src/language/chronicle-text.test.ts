import { describe, expect, it } from 'vitest';

import { checkProse, templateProse } from '../chronicle/prose.ts';
import type { StoredEntry } from '../chronicle/records.ts';
import { chronicleText } from './chronicle-text.ts';

const entry = (key: string, text: string, knowledgeType: string | null): StoredEntry =>
  ({
    key,
    text,
    occurredAt: 0,
    salience: 4,
    source: { kind: 'event', commandId: 'c1', index: 0, eventType: 'InformationShared' },
    memoryKind: null,
    locationId: null,
    participants: [],
    knowledge:
      knowledgeType === null
        ? []
        : [{ knowledgeId: 'k-1', knowledgeType, statement: 'Караван ушёл до рассвета.' }],
  }) as unknown as StoredEntry;

const TYPES = ['TESTIMONY', 'RUMOR', 'INFERENCE', 'HYPOTHESIS', 'CONTRADICTION', 'UNKNOWN'];

describe('Russian Chronicle prose (ADR 0031 §7)', () => {
  it('the deterministic template satisfies the hedging rule for every hedged type', () => {
    for (const type of TYPES) {
      const entries = [entry('e1', 'Рассказ. Говорит: Мира Вейл.', type)];
      expect(checkProse(entries, templateProse(entries, 'ru'), 'ru'), type).toEqual([]);
    }
  });

  it('tells an account as fact: refused; says whose it is: accepted', () => {
    const entries = [entry('e1', 'Рассказ.', 'TESTIMONY')];
    const fact = [{ text: 'Караван ушёл до рассвета.', cites: ['e1'] }];
    expect(checkProse(entries, fact, 'ru')).toHaveLength(1);
    for (const said of [
      'Мира говорит, что караван ушёл до рассвета.',
      'По словам Миры, караван ушёл до рассвета.',
      'Возможно, караван ушёл до рассвета.',
      'Ходили слухи о караване.',
      'Рассказы расходились.',
    ]) {
      expect(checkProse(entries, [{ text: said, cites: ['e1'] }], 'ru'), said).toEqual([]);
    }
  });

  it('does not take words that only contain a stem for a hedge', () => {
    const entries = [entry('e1', 'Рассказ.', 'HYPOTHESIS')];
    for (const plain of ['Показал дорогу.', 'Сказка о дороге.', 'Расходы гильдии растут.']) {
      expect(checkProse(entries, [{ text: plain, cites: ['e1'] }], 'ru'), plain).toHaveLength(1);
    }
  });

  it('each language judges its own words: an English hedge does not satisfy Russian prose', () => {
    const entries = [entry('e1', 'Рассказ.', 'TESTIMONY')];
    const english = [{ text: 'Mira said the caravan left before dawn.', cites: ['e1'] }];
    expect(checkProse(entries, english, 'en')).toEqual([]);
    expect(checkProse(entries, english, 'ru')).toHaveLength(1);
  });

  it('English wording is the one earlier revisions wrote', () => {
    const words = chronicleText('en');
    expect(words.died('Orin')).toBe('Orin died.');
    expect(words.battle('the road', '3 foes', 1, true)).toBe(
      'We fought 3 foes at the road. 1 of them fell. A spell was countered.',
    );
    expect(words.accountLabel('TESTIMONY')).toBe('According to that account');
  });
});
