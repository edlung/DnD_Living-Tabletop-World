import type { PlayerOutcome } from '@ltw/contracts';
import { translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru.ts';
import { outcomeMessage, rejectionMessage } from './outcome-messages.ts';

const en = (key: string, params?: Readonly<Record<string, string | number>>) =>
  translate('en', key, params);
const ru = (key: string, params?: Readonly<Record<string, string | number>>) =>
  translate('ru', key, params);

/*
 * Stage 360 (AI stand-in pass, player 20, 35, 36, 41): a question the server lists whether or
 * not the NPC knows anything came back "This action would make no change. Your view has been
 * refreshed.", read as an error; showing evidence said only that new leads "may" have appeared.
 */
describe('what a conversation’s result says', () => {
  it('answers a question with nothing new as an answer, not as a refusal', () => {
    expect(rejectionMessage(ru, 'NO_EFFECT', 'Nothing new to share', 'AskAbout')).toBe(
      'Об этом собеседнику нечего добавить.',
    );
    expect(rejectionMessage(en, 'NO_EFFECT', 'Nothing new to share', 'AskAbout')).toBe(
      'They have nothing new to tell you about this.',
    );
  });

  it('keeps the refusal’s words for every other command and code', () => {
    expect(rejectionMessage(ru, 'NO_EFFECT', 'Already here', 'EnterLocation')).toBe(
      'Это действие ничего не изменит. Ваш вид обновлён.',
    );
    expect(rejectionMessage(en, 'NOT_PRESENT', undefined, 'AskAbout')).toBe(
      'That subject is no longer within reach. Your view has been refreshed.',
    );
  });

  it('after evidence is shown, says how to hear what the NPC makes of it', () => {
    const shown = { kind: 'ShowEvidence', shown: 'k-1' } as PlayerOutcome;
    expect(outcomeMessage(ru, shown)).toBe(
      'Вы показали улику. Поговорите или спросите снова, чтобы узнать, что скажет собеседник.',
    );
    expect(outcomeMessage(en, shown)).not.toMatch(/may have/);
  });
});
