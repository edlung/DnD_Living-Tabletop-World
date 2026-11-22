import {
  CLIENT_BROWSERS,
  CLIENT_ERROR_KINDS,
  CLIENT_ERROR_ROLES,
  CLIENT_PAGES,
  CLIENT_PARTS,
  CLIENT_SYSTEMS,
  type ClientErrorView,
  type ClientPart,
} from '@ltw/contracts';
import { russianEntry, translate, type Translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru.ts';
import '../i18n/ru-images.ts';
import '../i18n/ru-play.ts';
import '../i18n/ru-visual.ts';
import '../i18n/ru-access.ts';
import '../i18n/ru-dm-screen.ts';
import '../i18n/ru-chat.ts';
import '../i18n/ru-accounts.ts';
import '../i18n/ru-display.ts';
import '../i18n/ru-privacy.ts';
import '../i18n/ru-rules.ts';
import '../i18n/ru-dice.ts';
import '../i18n/ru-report.ts';
import '../i18n/ru-book.ts';
import type { SheetId } from '../shell/use-shell.ts';
import { browserWords, kindWords, placeWords, whereWords, whoseWords } from './trouble-words.ts';

/** The DM's words for a report (docs/adr/0073-table-ideas.md §1): the application's own, in both languages. */
const ERROR: ClientErrorView = {
  errorId: '0'.repeat(32),
  kind: 'render',
  name: 'TypeError',
  page: 'game',
  part: 'chat',
  role: 'player',
  browser: 'safari',
  browserVersion: 18,
  system: 'ios',
  shell: 'none',
  place: [
    { file: 'index-a.js', line: 1, column: 2 },
    { file: 'chunk-b.js', line: 3, column: 4 },
  ],
  build: 'abc123',
  count: 1,
  firstAt: '2026-11-16T18:00:00.000Z',
  lastAt: '2026-11-16T18:00:00.000Z',
};
const en: Translate = (key, params) => translate('en', key, params);

describe('the words for a report', () => {
  it('say whose screen, which browser, where and what', () => {
    expect(whoseWords(en, ERROR)).toBe('A player’s screen');
    expect(browserWords(en, ERROR)).toBe('Safari 18 on an iPhone or iPad');
    expect(browserWords(en, { ...ERROR, shell: 'player' })).toBe(
      'Safari 18 on an iPhone or iPad, in the app',
    );
    expect(
      browserWords(en, { ...ERROR, browser: 'other', browserVersion: 0, system: 'other' }),
    ).toBe('Another browser on another device');
    expect(whereWords(en, ERROR)).toBe('Chat');
    expect(whereWords(en, { ...ERROR, page: 'display', part: 'none' })).toBe('The table’s display');
    expect(kindWords(en, ERROR)).toBe('The screen could not be shown');
    expect(placeWords(ERROR)).toBe('index-a.js:1:2 ← chunk-b.js:3:4');
  });

  it('have a Russian word for every value a report can hold', () => {
    const asked = new Set<string>();
    const t: Translate = (key) => {
      asked.add(key);
      return key;
    };
    for (const role of CLIENT_ERROR_ROLES) whoseWords(t, { ...ERROR, role });
    for (const kind of CLIENT_ERROR_KINDS) kindWords(t, { ...ERROR, kind });
    for (const page of CLIENT_PAGES) whereWords(t, { ...ERROR, page });
    for (const part of CLIENT_PARTS) whereWords(t, { ...ERROR, part });
    for (const browser of CLIENT_BROWSERS) browserWords(t, { ...ERROR, browser });
    for (const system of CLIENT_SYSTEMS) browserWords(t, { ...ERROR, system, shell: 'dm' });
    expect([...asked].filter((key) => russianEntry(key) === undefined)).toEqual([]);
  });

  it('know every sheet the dock can open', () => {
    // A sheet added to the shell must be a part a report can name.
    const sheet = (id: SheetId): ClientPart => id;
    expect(CLIENT_PARTS).toContain(sheet('session'));
  });
});
