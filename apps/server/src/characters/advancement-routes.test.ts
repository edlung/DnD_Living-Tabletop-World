import { randomUUID } from 'node:crypto';

import type {
  CharacterChoices,
  CharacterCreatedResponse,
  CharacterSheetResponse,
  LevelOptionsResponse,
  LevelUpChoices,
  LevelUpResponse,
} from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { get, post, ravenfordApp, seededEngine, TOKENS } from '../testing/ravenford-app.ts';
import { RAVENFORD_RU_FIXTURES_DIR } from '../world-engine/ravenford-seed.ts';

/**
 * Advancement over HTTP (docs/adr/0056-characters-from-the-srd.md §3): the DM's experience divided
 * among the characters named; a character with its next level's experience takes it with its
 * choices; a player without it is refused until the DM grants a level.
 */
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';

const fighter: CharacterChoices = {
  classId: 'fighter',
  speciesId: 'human',
  backgroundId: 'soldier',
  abilities: {
    method: 'standard-array',
    base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
  },
  increases: { plus2: 'str', plus1: 'con' },
  skills: ['acrobatics', 'perception'],
  moreSkills: ['history'],
  expertise: [],
  tools: ['srd-dice-gaming-set'],
  languages: ['dwarvish', 'elvish'],
  equipment: { classOption: 'C', backgroundOption: 'B', picks: [] },
  originFeat: 'alert',
  fightingStyle: 'defense',
  invocations: [],
  weaponMasteries: ['greatsword', 'flail', 'javelin'],
  cantrips: [],
  spells: [],
  spellbook: [],
};
const level: Omit<LevelUpChoices, 'classId'> = {
  hitPoints: 'fixed',
  cantrips: [],
  spells: [],
  spellbook: [],
  expertise: [],
  invocations: [],
  metamagic: [],
  weaponMasteries: [],
};

describe('advancement’s routes', () => {
  it('divides the DM’s experience; a character with enough takes its next level', async () => {
    const app = await ravenfordApp();
    const made = await post(
      app,
      `${BASE}/characters`,
      { requestId: randomUUID(), name: 'Ida Vane', choices: fighter },
      TOKENS.dm,
    );
    const { characterId } = made.json<CharacterCreatedResponse>();
    const award = await post(
      app,
      `${BASE}/experience?perspective=DM`,
      { requestId: randomUUID(), amount: 601, characterIds: [characterId, ELOWEN] },
      TOKENS.dm,
    );
    expect(award.json()).toEqual({ share: 300 });
    const options = (
      await get(app, `${BASE}/characters/${characterId}/level-options?perspective=DM`, TOKENS.dm)
    ).json<LevelOptionsResponse>();
    expect(options).toMatchObject({ ready: true, level: 1, experience: 300, nextAt: 300 });
    const asks = options.classes.find((one) => one.classId === 'fighter');
    expect(asks && 'asks' in asks ? asks.asks.features : []).toEqual([
      'Action Surge (one use)',
      'Tactical Mind',
    ]);
    const advanced = await post(
      app,
      `${BASE}/characters/${characterId}/advance?perspective=DM`,
      { requestId: randomUUID(), choices: { ...level, classId: 'fighter' } },
      TOKENS.dm,
    );
    expect(advanced.json<LevelUpResponse>().status).toBe('levelled');
    const sheet = (
      await get(app, `${BASE}/entities/${characterId}/sheet?perspective=DM`, TOKENS.dm)
    ).json<CharacterSheetResponse>();
    expect(sheet.sheet.classes).toEqual([{ classId: 'fighter', level: 2 }]);
  });

  it('refuses a player without the experience, until the DM grants a level', async () => {
    const app = await ravenfordApp();
    const path = `${BASE}/characters/${ELOWEN}/advance?perspective=CHARACTER:${ELOWEN}`;
    const choices = { ...level, classId: 'ranger' as const };
    const early = await post(app, path, { requestId: randomUUID(), choices }, TOKENS.player);
    expect(early.statusCode).toBe(409);
    // Only the DM grants a level; a choice the schema does not know is refused whole.
    const own = `${BASE}/characters/${ELOWEN}/milestone?perspective=CHARACTER:${ELOWEN}`;
    expect((await post(app, own, { requestId: randomUUID() }, TOKENS.player)).statusCode).toBe(403);
    const extra = { requestId: randomUUID(), choices: { ...choices, extra: true } };
    expect((await post(app, path, extra, TOKENS.player)).statusCode).toBe(400);
    const granted = await post(
      app,
      `${BASE}/characters/${ELOWEN}/milestone?perspective=DM`,
      { requestId: randomUUID() },
      TOKENS.dm,
    );
    expect(granted.statusCode).toBe(201);
    // Ranger 8 asks an improvement: without one the rules refuse, and nothing is taken.
    const refused = await post(app, path, { requestId: randomUUID(), choices }, TOKENS.player);
    expect(refused.statusCode).toBe(422);
    expect(refused.json<LevelUpResponse>().problems.map((one) => one.field)).toContain(
      'improvement',
    );
    const taken = await post(
      app,
      path,
      {
        requestId: randomUUID(),
        choices: { ...choices, improvement: { kind: 'scores', plus: ['wis', 'con'] } },
      },
      TOKENS.player,
    );
    expect(taken.json<LevelUpResponse>().status).toBe('levelled');
    const sheet = (
      await get(app, `${BASE}/entities/${ELOWEN}/sheet?perspective=DM`, TOKENS.dm)
    ).json<CharacterSheetResponse>();
    expect(sheet.sheet.classes.find((one) => one.classId === 'ranger')?.level).toBe(8);
    expect(sheet.sheet.pendingLevels).toBeUndefined();
  });

  it('names a level’s features in a Russian campaign’s words', async () => {
    const engine = await seededEngine(undefined, undefined, undefined, RAVENFORD_RU_FIXTURES_DIR);
    const app = await ravenfordApp(engine);
    const options = (
      await get(app, `${BASE}/characters/${ELOWEN}/level-options?perspective=DM`, TOKENS.dm)
    ).json<LevelOptionsResponse>();
    // Ranger 8: the improvement, as the Russian SRD names it.
    const ranger = options.classes.find((one) => one.classId === 'ranger');
    expect(ranger && 'asks' in ranger ? ranger.asks.features : []).toEqual([
      'Увеличение характеристик',
    ]);
  });
});
