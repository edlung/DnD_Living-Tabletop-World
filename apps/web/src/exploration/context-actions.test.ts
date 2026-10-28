import type { ContextAction, KnowledgeView } from '@ltw/contracts';
import { translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru.ts';
import '../i18n/ru-table.ts';
import { actionLabel, shortStatement } from './context-actions.tsx';

const en = (key: string, params?: Record<string, string | number>) => translate('en', key, params);
const ru = (key: string, params?: Record<string, string | number>) => translate('ru', key, params);

const CAMP =
  'Broken wagons and scattered crates fill a roadside clearing: the guild caravan was attacked here.';
const evidence = { knowledgeId: 'camp-clue', statement: CAMP } as unknown as KnowledgeView;
const show = {
  id: 'show_evidence',
  legal: true,
  evidence: { knowledgeId: 'camp-clue' },
} as unknown as ContextAction;

describe('the words of an action', () => {
  it('names a piece of evidence by its first words, cut at a word', () => {
    expect(shortStatement(CAMP)).toBe('Broken wagons and scattered crates fill a…');
    expect(shortStatement('A torn ledger.')).toBe('A torn ledger.');
    expect(actionLabel(en, show, 'Orin', [evidence])).toBe(
      'Show evidence: Broken wagons and scattered crates fill a…',
    );
    expect(actionLabel(en, show, 'Orin', []).length).toBeLessThan(40);
  });

  it('says every other action in the reader’s language', () => {
    const trade = { id: 'trade', legal: false } as unknown as ContextAction;
    const longbow = { id: 'longbow_attack', legal: true } as unknown as ContextAction;
    expect(actionLabel(en, trade, 'Orin', [])).toBe('Trade');
    expect(actionLabel(ru, trade, 'Orin', [])).toBe('Торговать');
    expect(actionLabel(ru, longbow, 'Orin', [])).toBe('Атака из длинного лука');
  });
});
