import { describe, expect, it } from 'vitest';

import { DM, ELOWEN, OUTSIDER, PLAYER, codeOf, investigationWorld } from './testing/world.ts';

/** DM authoring of clues and disclosure; who may issue what (ADR 0013 §1–3). */
describe('AddClue', () => {
  it.each([
    [{ entityId: 'goblin-weapon', method: 'investigation' }, 'INVALID_CLUE'],
    [{ entityId: 'goblin-weapon', method: 'inspect', dc: 10 }, 'INVALID_CLUE'],
    [{ entityId: 'mira-vale', method: 'perception', dc: 10 }, 'INVALID_CLUE'],
    [{ entityId: 'merchant-guild-faction', method: 'inspect' }, 'INVALID_CLUE'],
    [{ entityId: 'no-such-entity', method: 'inspect' }, 'ENTITY_NOT_FOUND'],
    [{ entityId: 'goblin-weapon', method: 'inspect', subjects: ['x-missing'] }, 'ENTITY_NOT_FOUND'],
    [
      { entityId: 'goblin-weapon', method: 'inspect', clueId: 'clue-blade-found' },
      'ID_ALREADY_USED',
    ],
  ])('rejects %o with %s', async (fields, code) => {
    const world = await investigationWorld();
    const result = await world.submit({ type: 'AddClue', statement: 'Something.', ...fields }, DM);
    expect(codeOf(result)).toBe(code);
  });

  it('caps clues per entity and method', async () => {
    const world = await investigationWorld();
    const add = () =>
      world.submit(
        {
          type: 'AddClue',
          entityId: 'goblin-weapon',
          method: 'perception',
          dc: 10,
          statement: 'x',
        },
        DM,
      );
    for (let i = 0; i < 8; i += 1) expect(codeOf(await add())).toBe('accepted');
    expect(codeOf(await add())).toBe('INVALID_CLUE');
  });
});

describe('SetDisclosure', () => {
  it.each([
    ['orin-symbol-secret', 'WILLING', 'INVALID_DISCLOSURE'],
    ['pub-golden-stag', 'WILLING', 'INVALID_DISCLOSURE'],
    ['mira-cargo-logistics', 'WILLING', 'NO_EFFECT'],
    ['thorne-missing-patrol', 'GUARDED', 'NO_EFFECT'],
    ['no-such-record', 'WILLING', 'KNOWLEDGE_NOT_FOUND'],
    ['mira-cargo-logistics', 'GUARDED', 'accepted'],
  ])('%s → %s is %s', async (knowledgeId, disclosure, code) => {
    const world = await investigationWorld();
    expect(codeOf(await world.submit({ type: 'SetDisclosure', knowledgeId, disclosure }, DM))).toBe(
      code,
    );
  });
});

describe('authorization', () => {
  it('keeps authoring DM-only', async () => {
    const world = await investigationWorld();
    for (const command of [
      { type: 'AddClue', entityId: 'goblin-weapon', method: 'inspect', statement: 'x' },
      { type: 'SetDisclosure', knowledgeId: 'orin-knows-thorne', disclosure: 'WILLING' },
    ]) {
      expect(codeOf(await world.submit(command, PLAYER))).toBe('FORBIDDEN');
    }
  });

  it('lets a player act only for their own character, without revealing other IDs', async () => {
    const world = await investigationWorld();
    const enter = (characterId: string) => ({
      type: 'EnterLocation',
      characterId,
      locationId: 'ravenford',
    });
    const forbidden = [
      await world.submit(enter('mira-vale'), PLAYER),
      await world.submit(enter('no-such-character'), PLAYER),
      await world.submit(enter(ELOWEN), OUTSIDER),
    ].map((result) =>
      result.status === 'rejected' ? [result.code, result.message] : result.status,
    );
    expect(new Set(forbidden.map((entry) => JSON.stringify(entry))).size).toBe(1);
    expect(forbidden[0]).toEqual(['FORBIDDEN', 'Not permitted to issue EnterLocation']);
    expect(codeOf(await world.submit(enter(ELOWEN), PLAYER))).toBe('accepted');
    expect(codeOf(await world.submit(enter(ELOWEN), DM))).toBe('NO_EFFECT');
  });

  it('never accepts an engine resolution inside a submission', async () => {
    const world = await investigationWorld();
    const result = await world.submit({
      type: 'ExamineEntity',
      characterId: ELOWEN,
      entityId: 'mira-vale',
      method: 'inspect',
      resolution: { ids: [], d20: 20 },
    });
    expect(codeOf(result)).toBe('INVALID_COMMAND');
  });
});
