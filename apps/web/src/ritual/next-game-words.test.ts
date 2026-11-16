import { describe, expect, it } from 'vitest';

import {
  daysUntil,
  fromLocalInput,
  msToNextDay,
  nextGameWords,
  readerLocale,
  toLocalInput,
  untilWords,
} from './next-game-words.ts';

describe('the next game in words', () => {
  it('counts the calendar’s days, not twenty-four hours', () => {
    const now = new Date(2026, 10, 15, 23, 30);
    expect(daysUntil(new Date(2026, 10, 15, 23, 45), now)).toBe(0);
    expect(daysUntil(new Date(2026, 10, 16, 0, 15), now)).toBe(1);
    expect(daysUntil(new Date(2026, 10, 21, 18, 0), now)).toBe(6);
    // The evening itself, a few hours in: still today.
    expect(daysUntil(new Date(2026, 10, 15, 18, 0), now)).toBe(0);
  });

  it('says today, tomorrow or in how many days, as each language declines it', () => {
    expect([0, 1, 6].map((days) => untilWords('en', days))).toEqual([
      'today',
      'tomorrow',
      'in 6 days',
    ]);
    expect([0, 1, 2, 5, 21].map((days) => untilWords('ru', days))).toEqual([
      'сегодня',
      'завтра',
      'послезавтра',
      'через 5 дней',
      'через 21 день',
    ]);
  });

  it('says when and how far off in one line', () => {
    const now = new Date(2026, 10, 15, 12, 0);
    const at = new Date(2026, 10, 21, 18, 0).toISOString();
    expect(nextGameWords({ at, note: 'At Grandma’s' }, 'en-GB', now)).toMatch(
      /^Saturday,? 21 November.* 18:00 — in 6 days$/,
    );
    expect(nextGameWords({ at, note: '' }, 'ru', now)).toMatch(
      /^суббота, 21 ноября.* 18:00 — через 6 дней$/,
    );
  });

  it('counts on from the reader’s next midnight', () => {
    expect(msToNextDay(new Date(2026, 10, 15, 23, 59, 0))).toBe(61_000);
    expect(msToNextDay(new Date(2026, 10, 15, 0, 0, 0))).toBe(86_401_000);
  });

  it('writes the hour as the reader’s own flavour of the language does', () => {
    expect(readerLocale('en', ['ru-RU', 'en-GB', 'en-US'])).toBe('en-GB');
    expect(readerLocale('ru', ['en-US', 'ru'])).toBe('ru');
    // A reader whose browser does not name the campaign's language reads it plainly.
    expect(readerLocale('ru', ['en-US'])).toBe('ru');
    expect(readerLocale('en', [])).toBe('en');
    const now = new Date(2026, 10, 15, 12, 0);
    const at = new Date(2026, 10, 21, 18, 0).toISOString();
    expect(nextGameWords({ at, note: '' }, 'en-US', now)).toMatch(
      /^Saturday, November 21.* 6:00\sPM — in 6 days$/,
    );
  });

  it('goes to a date field and back in the reader’s own time zone', () => {
    const at = new Date(2026, 10, 21, 18, 5).toISOString();
    expect(toLocalInput(at)).toBe('2026-11-21T18:05');
    expect(fromLocalInput('2026-11-21T18:05')).toBe(at);
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('soon')).toBeNull();
  });
});
