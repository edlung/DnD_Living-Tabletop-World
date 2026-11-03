import { randomUUID } from 'node:crypto';

import type {
  CharacterChoices,
  CharacterCreatedResponse,
  CharacterOptionsResponse,
  CharacterPreviewResponse,
  CharacterSheetResponse,
} from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { get, post, ravenfordApp, TOKENS } from '../testing/ravenford-app.ts';

/**
 * The character builder over HTTP (docs/adr/0056-characters-from-the-srd.md §2): what it offers,
 * a preview, and a character made through the World Engine — by the DM for a player or to invite
 * one, by a seated player for themselves; never a player's actor in an answer.
 */
const BASE = '/campaigns/ravenford';

const fighter: CharacterChoices = {
  classId: 'fighter',
  speciesId: 'dwarf',
  backgroundId: 'soldier',
  abilities: {
    method: 'standard-array',
    base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
  },
  increases: { plus2: 'str', plus1: 'con' },
  skills: ['acrobatics', 'perception'],
  moreSkills: [],
  expertise: [],
  tools: ['srd-dice-gaming-set'],
  languages: ['dwarvish', 'elvish'],
  equipment: { classOption: 'A', backgroundOption: 'A', picks: ['srd-dice-gaming-set'] },
  fightingStyle: 'defense',
  invocations: [],
  weaponMasteries: ['greatsword', 'flail', 'javelin'],
  cantrips: [],
  spells: [],
  spellbook: [],
};

describe('the character builder’s routes', () => {
  it('offers the twelve classes, the species, backgrounds and level 1 spells to the table', async () => {
    const app = await ravenfordApp();
    const options = (
      await get(app, `${BASE}/character-options`, TOKENS.player)
    ).json<CharacterOptionsResponse>();
    expect(options.classes).toHaveLength(12);
    expect(options.species).toHaveLength(9);
    expect(options.backgrounds.map((one) => one.name)).toEqual([
      'Acolyte',
      'Criminal',
      'Sage',
      'Soldier',
    ]);
    expect(options.originFeats).toHaveLength(4);
    expect(options.spells).toHaveLength(339);
    expect(options.levelFeats.map((one) => one.category)).toContain('Epic Boon');
    const wizard = options.classes.find((one) => one.classId === 'wizard');
    expect(wizard?.casting).toEqual({ ability: 'int', cantrips: 3, prepared: 4, slots: 2 });
    expect((await get(app, `${BASE}/character-options`, TOKENS.outsider)).statusCode).toBe(404);
  });

  it('previews the choices and names what does not hold', async () => {
    const app = await ravenfordApp();
    const preview = (
      await post(app, `${BASE}/characters/preview`, { choices: fighter }, TOKENS.dm)
    ).json<CharacterPreviewResponse>();
    expect(preview.problems).toEqual([]);
    // 10 + Con 15's +2 + Dwarven Toughness.
    expect(preview.sheet?.hitPoints.max).toBe(13);
    expect(preview.items.map((item) => item.catalogId)).toContain('srd-chain-mail');
    const wrong = (
      await post(
        app,
        `${BASE}/characters/preview`,
        { choices: { ...fighter, skills: ['arcana', 'perception'] } },
        TOKENS.dm,
      )
    ).json<CharacterPreviewResponse>();
    expect(wrong.problems.map((problem) => problem.field)).toEqual(['skills']);
    expect(wrong.sheet).toBeNull();
  });

  it('makes a character through the World Engine, worn armor counted, once per request', async () => {
    const app = await ravenfordApp();
    const requestId = randomUUID();
    const made = await post(
      app,
      `${BASE}/characters`,
      { requestId, name: 'Brunna Stonehand', choices: fighter },
      TOKENS.dm,
    );
    expect(made.statusCode).toBe(201);
    const { characterId } = made.json<CharacterCreatedResponse>();
    const again = await post(
      app,
      `${BASE}/characters`,
      { requestId, name: 'Brunna Stonehand', choices: fighter },
      TOKENS.dm,
    );
    expect(again.json<CharacterCreatedResponse>().characterId).toBe(characterId);
    const sheet = (
      await get(app, `${BASE}/entities/${characterId}/sheet?perspective=DM`, TOKENS.dm)
    ).json<CharacterSheetResponse>();
    // Chain Mail's 16; Defense's +1 is the rules' at a later stage.
    expect(sheet.sheet.armorClass).toBe(16);
    expect(sheet.sheet.feats).toEqual(['savage-attacker', 'defense']);
    expect(JSON.stringify(made.json())).not.toContain('dev-');
  });

  it('lets a seated player make their own character, never one for another', async () => {
    const app = await ravenfordApp();
    const own = await post(
      app,
      `${BASE}/characters`,
      { requestId: randomUUID(), name: 'Tamsin', choices: fighter },
      TOKENS.player,
    );
    expect(own.statusCode).toBe(201);
    const forAnother = await post(
      app,
      `${BASE}/characters`,
      {
        requestId: randomUUID(),
        name: 'Tamsin',
        choices: fighter,
        forPlayerOf: 'elowen-starwhisper',
      },
      TOKENS.player,
    );
    expect(forAnother.statusCode).toBe(403);
    const refused = await post(
      app,
      `${BASE}/characters`,
      {
        requestId: randomUUID(),
        name: 'Tamsin',
        choices: { ...fighter, fightingStyle: undefined },
      },
      TOKENS.player,
    );
    expect(refused.statusCode).toBe(422);
    expect(JSON.stringify(refused.json())).toContain('fightingStyle');
  });
});
