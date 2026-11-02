import type { KnowledgeView, PlayerOutcome } from '@ltw/contracts';
import { translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru.ts';
import '../i18n/ru-space.ts';
import { outcomeMessage, rejectionMessage, toldAbout } from './outcome-messages.ts';

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
    expect(rejectionMessage(ru, 'NO_EFFECT', 'Nothing new to share', 'AskAbout', true)).toBe(
      'Об этом собеседнику нечего добавить.',
    );
    expect(rejectionMessage(en, 'NO_EFFECT', 'Nothing new to share', 'AskAbout', true)).toBe(
      'They have nothing new to tell you about this.',
    );
  });

  // Second stand-in pass (player 12): "nothing to add" when nothing had been said at all.
  it('says "nothing to add" only after the NPC told something about the topic', () => {
    expect(rejectionMessage(ru, 'NO_EFFECT', 'Nothing new to share', 'AskAbout', false)).toBe(
      'Собеседнику нечего сказать об этом.',
    );
    expect(rejectionMessage(en, 'NO_EFFECT', 'Nothing new to share', 'AskAbout')).toBe(
      'They have nothing to say about this.',
    );
    const record = (changes: Partial<KnowledgeView>): KnowledgeView => ({
      knowledgeId: 'k-1',
      knowledgeType: 'TESTIMONY',
      scope: { kind: 'PARTY' },
      statement: 'The caravan carried goods for the guild.',
      subjects: [{ entityId: 'guild-caravan', kind: 'item', name: 'Caravan' }],
      attributedTo: { entityId: 'mira-vale', kind: 'npc', name: 'Mira Vale' },
      relations: [],
      knownSince: 0,
      ...changes,
    });
    expect(toldAbout([record({})], 'mira-vale', 'guild-caravan')).toBe(true);
    expect(toldAbout([record({})], 'orin-stonebeard', 'guild-caravan')).toBe(false);
    expect(toldAbout([record({})], 'mira-vale', 'old-trade-road')).toBe(false);
    // The DM's view holds the NPC's own records: those were never told.
    const own = record({ scope: { kind: 'NPC', npcId: 'mira-vale' } });
    expect(toldAbout([own], 'mira-vale', 'guild-caravan')).toBe(false);
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

// docs/adr/0049-space-and-movement.md §6–8: a move says where it took the mover, its height, a
// landing's check and a fall, not only the square.
describe('what a move’s result says', () => {
  const move = (more: Partial<Extract<PlayerOutcome, { kind: 'MoveCombatant' }>>) =>
    ({ kind: 'MoveCombatant', position: { x: 3, y: 6 }, ...more }) as PlayerOutcome;

  it('says how high a flyer is', () => {
    expect(outcomeMessage(en, move({ altitudeFt: 10 }))).toBe(
      'You moved to 3, 6. You are 10 ft up.',
    );
    expect(outcomeMessage(ru, move({ altitudeFt: 10 }))).toContain('Вы на высоте 10 фт.');
  });

  it('tells a fall and the Prone it left', () => {
    expect(outcomeMessage(en, move({ fell: { feet: 10, damage: 5 }, prone: true }))).toBe(
      'You moved to 3, 6. You fall 10 ft and take 5 damage. You are Prone.',
    );
  });

  it('tells a landing’s check, saying Prone once', () => {
    expect(outcomeMessage(en, move({ landing: { total: 7, success: false }, prone: true }))).toBe(
      'You moved to 3, 6. Landing: Acrobatics 7, you fall Prone.',
    );
    expect(outcomeMessage(ru, move({ landing: { total: 14, success: true } }))).toContain(
      'вы устояли на ногах',
    );
  });
});
