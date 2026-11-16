import { AGREEMENT_LIMITS, AGREEMENT_TONES, agreementRequestSchema } from '@ltw/contracts';
import { translate, type Translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru-agreement.ts';
import { dmPagesOf } from '../guide/dm-guide.ts';
import { FAMILY_AGREEMENT, limitWords, toneWords } from './agreement-words.ts';

const en: Translate = (key, values) => translate('en', key, values);
const ru: Translate = (key, values) => translate('ru', key, values);

describe('the table’s agreement in words', () => {
  it('starts from a page the server accepts as it is', () => {
    expect(agreementRequestSchema.parse(FAMILY_AGREEMENT)).toEqual(FAMILY_AGREEMENT);
    expect(FAMILY_AGREEMENT.limits).toContain('harm-to-children');
  });

  it('says every tone and every limit in both languages, each in its own words', () => {
    const tones = AGREEMENT_TONES.map((tone) => [toneWords(en, tone), toneWords(ru, tone)]);
    const limits = AGREEMENT_LIMITS.map((limit) => [limitWords(en, limit), limitWords(ru, limit)]);
    for (const [english, russian] of [...tones, ...limits]) {
      expect(russian).not.toBe(english);
      expect(russian).toMatch(/[а-яё]/i);
    }
    expect(new Set(tones.flat()).size).toBe(tones.length * 2);
    expect(new Set(limits.flat()).size).toBe(limits.length * 2);
  });
});

describe('“How to run the game”', () => {
  it('has seven pages of a few lines each, in both languages', () => {
    const english = dmPagesOf(en);
    const russian = dmPagesOf(ru);
    expect(english.map((page) => page.title)).toEqual([
      'Before the evening',
      'The first meeting',
      'Opening the evening',
      'During the game',
      'The table’s screen',
      'Closing the evening',
      'When something goes wrong',
    ]);
    english.forEach((page, index) => {
      expect(page.lines.length).toBeGreaterThanOrEqual(2);
      expect(page.lines.length).toBeLessThanOrEqual(3);
      expect(russian[index]?.title).toMatch(/[а-яё]/i);
      russian[index]?.lines.forEach((line) => {
        expect(line).toMatch(/[а-яё]/i);
      });
    });
  });
});
