import type { EntityRef } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { replyLocally } from './local-dialogue.ts';
import { interpretLocally } from './local-provider.ts';

const directory: EntityRef[] = [
  { entityId: 'north-gate', kind: 'location', name: 'Северные ворота' },
  { entityId: 'market-square', kind: 'location', name: 'Рыночная площадь' },
  { entityId: 'guild-caravan', kind: 'item', name: 'Караван Торговой гильдии' },
  { entityId: 'orin-stonebeard', kind: 'npc', name: 'Орин Стоунберд' },
];

describe('the offline interpreter in Russian (ADR 0031 §8)', () => {
  it('adds a person near a place, whatever case the place is written in', () => {
    const proposal = interpretLocally(
      'Добавь: молодой стражник у Северных ворот, который видел, как ушёл караван.',
      directory,
    ) as {
      commands: { type: string; entityId?: string; description?: string; statement?: string }[];
    };
    expect(proposal.commands[0]).toMatchObject({
      type: 'CreateEntity',
      entityId: 'tomas-reed',
      description: 'Молодой стражник.',
    });
    expect(proposal.commands[1]?.statement).toBe('Свидетель: Томас Рид. Видел, как ушёл караван.');
  });

  it('moves, kills, and advances time', () => {
    expect(
      interpretLocally('Перемести Орин Стоунберд на Рыночную площадь.', directory),
    ).toMatchObject({
      commands: [{ type: 'PlaceEntity', entityId: 'orin-stonebeard', locationId: 'market-square' }],
    });
    expect(interpretLocally('Орин Стоунберд погиб.', directory)).toMatchObject({
      commands: [{ type: 'ChangeEntityStatus', entityId: 'orin-stonebeard', status: 'dead' }],
    });
    expect(interpretLocally('Продвинь время на 3 часа.', directory)).toMatchObject({
      commands: [{ type: 'AdvanceWorldTime', by: 10_800 }],
    });
  });

  it('proposes nothing for what it does not understand, and never takes English for Russian', () => {
    expect(interpretLocally('Расскажи мне анекдот.', directory)).toMatchObject({ commands: [] });
    const english = interpretLocally('Add a guard near North Gate who saw the caravan.', [
      { entityId: 'north-gate', kind: 'location', name: 'North Gate' },
    ]) as { commands: { type: string; name?: string }[] };
    expect(english.commands[0]).toMatchObject({ type: 'CreateEntity', name: 'Tomas Reed' });
  });
});

describe('NPC replies in Russian', () => {
  const base = {
    npc: 'Орин Стоунберд',
    speaker: 'Эловен Старвиспер',
    attitude: 'NEUTRAL' as const,
    time: 'День 1 · 10:00',
    place: 'Алхимическая лавка',
    around: [],
    intent: 'ask' as const,
    accepted: true,
    topic: 'Странный знак',
    justTold: [],
    mayTell: [],
    common: [],
    memories: [],
    shown: [],
    guarded: ['Странный знак'],
    line: null,
    language: 'ru' as const,
  };

  it('keeps a guarded topic guarded, in present tense with the name in the nominative', () => {
    expect(replyLocally(base).reply).toBe(
      'Орин Стоунберд поднимает взгляд. «Тема «Странный знак» — не для разговора.»',
    );
  });

  it('says plainly what it was just told to say', () => {
    expect(
      replyLocally({ ...base, guarded: [], justTold: ['Караван ушёл до рассвета.'] }).reply,
    ).toContain('«Караван ушёл до рассвета.»');
  });
});
