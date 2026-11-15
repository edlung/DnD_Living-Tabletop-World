import { describe, expect, it } from 'vitest';

import { nextGameCalendar, settable, shownNextGame } from './next-game.ts';

const NOW = '2026-11-15T12:00:00.000Z';
const next = (at: string, note = '') => ({ at, note });

describe('the next game', () => {
  it('stays shown through its own evening and is past six hours after it began', () => {
    const game = next('2026-11-21T16:00:00.000Z');
    expect(shownNextGame(game, NOW)).toEqual(game);
    expect(shownNextGame(game, '2026-11-21T21:59:00.000Z')).toEqual(game);
    expect(shownNextGame(game, '2026-11-21T22:00:00.000Z')).toBeNull();
    expect(shownNextGame(null, NOW)).toBeNull();
  });

  it('is a date within two years ahead and not an evening already over', () => {
    expect(settable('2026-11-21T16:00:00.000Z', NOW)).toBe(true);
    // Whatever may be set is shown: the two windows are one.
    expect(settable('2026-11-15T08:00:00.000Z', NOW)).toBe(true);
    expect(shownNextGame(next('2026-11-15T08:00:00.000Z'), NOW)).not.toBeNull();
    expect(settable('2026-11-15T06:00:00.000Z', NOW)).toBe(false);
    expect(settable('2026-11-14T08:00:00.000Z', NOW)).toBe(false);
    expect(settable('2029-01-01T00:00:00.000Z', NOW)).toBe(false);
    expect(settable('not a date', NOW)).toBe(false);
  });
});

describe('the next game as a calendar file', () => {
  const file = (note = '', campaignName = 'The Missing Caravan') =>
    nextGameCalendar({
      campaignId: 'ravenford',
      campaignName,
      next: next('2026-11-21T16:00:00.000Z', note),
      host: 'ltw.example',
      now: NOW,
      sequence: 3,
    });

  it('is one event in UTC with a stable UID, an evening long, with two reminders', () => {
    const lines = file().split('\r\n');
    expect(lines.slice(0, 2)).toEqual(['BEGIN:VCALENDAR', 'VERSION:2.0']);
    expect(lines).toContain('UID:next-game-ravenford@ltw.example');
    expect(lines).toContain('SEQUENCE:3');
    expect(lines).toContain('DTSTAMP:20261115T120000Z');
    expect(lines).toContain('DTSTART:20261121T160000Z');
    expect(lines).toContain('DTEND:20261121T190000Z');
    expect(lines).toContain('SUMMARY:The Missing Caravan');
    expect(lines.filter((line) => line.startsWith('TRIGGER:'))).toEqual([
      'TRIGGER:-P1D',
      'TRIGGER:-PT1H',
    ]);
    expect(lines.filter((line) => line.startsWith('DESCRIPTION:'))).toHaveLength(2);
    expect(lines.at(-2)).toBe('END:VCALENDAR');
    // Every line ends CRLF, the last one too.
    expect(file().endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(file()).not.toMatch(/[^\r]\n/);
  });

  it('escapes the campaign’s name and the DM’s line, and lets neither add a line of its own', () => {
    const made = file(
      'At Grandma’s; bring dice, snacks\nEND:VEVENT\r\nATTENDEE:mailto:x@example.org',
      'Caravan, lost; \\ found',
    );
    expect(made).toContain('SUMMARY:Caravan\\, lost\\; \\\\ found');
    const lines = made.replace(/\r\n /g, '').split('\r\n');
    expect(lines.filter((line) => line === 'END:VEVENT')).toHaveLength(1);
    expect(lines.some((line) => line.startsWith('ATTENDEE'))).toBe(false);
    expect(lines).toContain(
      'DESCRIPTION:At Grandma’s\\; bring dice\\, snacks\\nEND:VEVENT \\nATTENDEE:mailto:x@example.org',
    );
  });

  it('keeps control characters out of the file', () => {
    const made = file(
      `Bring${String.fromCharCode(9)}dice${String.fromCharCode(7)}${String.fromCharCode(127)}!`,
    );
    expect(made).toContain('DESCRIPTION:Bring dice  !');
  });

  it('folds a long line at 75 octets without cutting a character', () => {
    const made = file(
      '',
      'Пропавший караван и очень длинное название кампании для проверки переноса',
    );
    for (const line of made.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    expect(made.replace(/\r\n /g, '')).toContain(
      'SUMMARY:Пропавший караван и очень длинное название кампании для проверки переноса',
    );
  });
});
