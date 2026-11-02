import {
  CONTEXT_ACTION_IDS,
  CONTEXT_HINTS,
  CONTEXT_ILLEGAL_REASONS,
  type ContextAction,
} from '../../packages/contracts/src/index.ts';
import { russianEntry, type Translate } from '../../packages/ui/src/index.ts';
import { describe, expect, it } from 'vitest';

import {
  actionLabel,
  hintWords,
  reasonWords,
} from '../../apps/web/src/exploration/context-actions.tsx';

import { clientKeys } from './client-keys.ts';

import '../../apps/web/src/i18n/ru.ts';
import '../../apps/web/src/i18n/ru-play.ts';
import '../../apps/web/src/i18n/ru-visual.ts';
import '../../apps/web/src/i18n/ru-access.ts';
import '../../apps/web/src/i18n/ru-workshop-editor.ts';
import '../../apps/web/src/i18n/ru-workshop-scenario.ts';
import '../../apps/web/src/i18n/ru-workshop-preview.ts';
import '../../apps/web/src/i18n/ru-workshop-editing.ts';
import '../../apps/web/src/i18n/ru-workshop-activation.ts';
import '../../apps/web/src/i18n/ru-images.ts';
import '../../apps/web/src/i18n/ru-table.ts';
import '../../apps/web/src/i18n/ru-items.ts';
import '../../apps/web/src/i18n/ru-character.ts';
import '../../apps/web/src/i18n/ru-dice.ts';
import '../../apps/web/src/i18n/ru-inventory.ts';
import '../../apps/web/src/i18n/ru-rest.ts';
import '../../apps/web/src/i18n/ru-accounts.ts';
import '../../apps/web/src/i18n/ru-display.ts';
import '../../apps/web/src/i18n/ru-dm-screen.ts';
import '../../apps/web/src/i18n/ru-chat.ts';
import '../../apps/web/src/i18n/ru-guide.ts';
import '../../apps/web/src/i18n/ru-companion.ts';
import '../../apps/web/src/i18n/ru-conditions.ts';

/**
 * Every English string the client can show has a Russian entry, and every entry keeps the
 * `{placeholders}` of its source (docs/adr/0031-play-language.md §10). Keys are found by
 * reading the source: `t('…')` calls, plus constant tables of sentences (REFUSALS, messages)
 * that reach the screen through `t()` at render.
 */
const placeholders = (text: string) =>
  [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

describe('the Russian client dictionary', () => {
  const unique = clientKeys();

  it('finds the strings the client shows', () => {
    expect(unique.length).toBeGreaterThan(300);
  });

  it('has a Russian entry for every English string', () => {
    const missing = unique.filter((key) => russianEntry(key) === undefined);
    expect(missing).toEqual([]);
  });

  it('has the words made from the server’s vocabularies: actions, reasons, hints', () => {
    // No literal shows these: "trade" and "longbow attack" once reached a Russian screen
    // (second AI stand-in pass). Each word is recorded as the client asks for it.
    const asked = new Set<string>();
    const t: Translate = (key) => {
      asked.add(key);
      return key;
    };
    for (const id of CONTEXT_ACTION_IDS) {
      actionLabel(t, { id, legal: true } as unknown as ContextAction, 'Mira Vale', []);
    }
    for (const reason of CONTEXT_ILLEGAL_REASONS) {
      reasonWords(t, { id: 'talk', legal: false, reason } as unknown as ContextAction);
    }
    for (const hint of CONTEXT_HINTS) hintWords(t, hint);
    expect([...asked].filter((key) => russianEntry(key) === undefined)).toEqual([]);
  });

  it('keeps the placeholders of each source string', () => {
    for (const key of unique) {
      const russian = russianEntry(key);
      if (russian !== undefined) expect(placeholders(russian), key).toEqual(placeholders(key));
    }
  });
});
