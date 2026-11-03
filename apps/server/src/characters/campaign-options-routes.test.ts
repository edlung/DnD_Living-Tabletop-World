import { randomUUID } from 'node:crypto';

import {
  DEFAULT_CAMPAIGN_OPTIONS,
  type CampaignOptions,
  type CharacterCreatedResponse,
  type CharacterOptionsResponse,
  type CharacterSheetResponse,
  type CommandResult,
  type DmHistoryResponse,
  type InventoryResponse,
  type LevelOptionsResponse,
  type LevelUpChoices,
  type LevelUpResponse,
  type LobbyResponse,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import { get, post, ravenfordApp, TOKENS } from '../testing/ravenford-app.ts';

/**
 * The campaign's options over HTTP (docs/adr/0056-characters-from-the-srd.md §3): the DM sets them
 * as a command; the lobby and the builder read them back; advancement, a new character's level and
 * an enforced load follow them; the DM's history lists the change.
 */
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';
const AS_ELOWEN = `perspective=CHARACTER:${ELOWEN}`;

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

async function dm(app: FastifyInstance, command: object): Promise<CommandResult> {
  const response = await post(
    app,
    `${BASE}/commands?perspective=DM`,
    { commandId: `options-${randomUUID()}`, command },
    TOKENS.dm,
  );
  return response.json<CommandResult>();
}

const setOptions = (app: FastifyInstance, change: Partial<CampaignOptions>) =>
  dm(app, { type: 'SetCampaignOptions', options: { ...DEFAULT_CAMPAIGN_OPTIONS, ...change } });

describe('the campaign options over HTTP', () => {
  it('are the DM’s to set, and the lobby and the builder read them back', async () => {
    const app = await ravenfordApp();
    const player = await post(
      app,
      `${BASE}/commands?${AS_ELOWEN}`,
      {
        commandId: 'mine',
        command: { type: 'SetCampaignOptions', options: DEFAULT_CAMPAIGN_OPTIONS },
      },
      TOKENS.player,
    );
    expect(player.statusCode).toBe(403);
    expect((await setOptions(app, { startingLevel: 4, carrying: 'enforced' })).status).toBe(
      'accepted',
    );
    const lobby = (await get(app, `${BASE}/lobby?perspective=DM`, TOKENS.dm)).json<LobbyResponse>();
    expect(lobby.options).toEqual({
      ...DEFAULT_CAMPAIGN_OPTIONS,
      startingLevel: 4,
      carrying: 'enforced',
    });
    const builder = (
      await get(app, `${BASE}/character-options`, TOKENS.player)
    ).json<CharacterOptionsResponse>();
    expect(builder.startingLevel).toBe(4);
    const history = (
      await get(app, `${BASE}/dm/history?perspective=DM`, TOKENS.dm)
    ).json<DmHistoryResponse>();
    expect(history.entries[0]).toMatchObject({
      kind: 'world',
      change: { kind: 'options', from: DEFAULT_CAMPAIGN_OPTIONS },
    });
  });

  it('count no experience by milestone: a level waits for the DM to grant it', async () => {
    const app = await ravenfordApp();
    await setOptions(app, { levelsBy: 'milestone' });
    const award = await post(
      app,
      `${BASE}/experience?perspective=DM`,
      { requestId: randomUUID(), amount: 100_000, characterIds: [ELOWEN] },
      TOKENS.dm,
    );
    expect(award.statusCode).toBe(409);
    const levels = (
      await get(app, `${BASE}/characters/${ELOWEN}/level-options?${AS_ELOWEN}`, TOKENS.player)
    ).json<LevelOptionsResponse>();
    expect(levels).toMatchObject({
      ready: false,
      options: { levelsBy: 'milestone', hitPointsAtLevel: 'choice' },
    });
  });

  it('take a level’s hit points only the campaign’s way', async () => {
    const app = await ravenfordApp();
    await setOptions(app, { hitPointsAtLevel: 'fixed' });
    await post(
      app,
      `${BASE}/characters/${ELOWEN}/milestone?perspective=DM`,
      { requestId: randomUUID() },
      TOKENS.dm,
    );
    const path = `${BASE}/characters/${ELOWEN}/advance?${AS_ELOWEN}`;
    const choices = {
      ...level,
      classId: 'ranger' as const,
      improvement: { kind: 'scores' as const, plus: ['wis' as const, 'con' as const] },
    };
    const rolled = await post(
      app,
      path,
      { requestId: randomUUID(), choices: { ...choices, hitPoints: 'rolled' } },
      TOKENS.player,
    );
    expect(rolled.statusCode).toBe(422);
    expect(rolled.json<LevelUpResponse>().problems).toEqual([
      { field: 'hitPoints', message: 'This campaign takes the fixed hit points' },
    ]);
    const fixed = await post(app, path, { requestId: randomUUID(), choices }, TOKENS.player);
    expect(fixed.json<LevelUpResponse>().status).toBe('levelled');
  });

  it('start a new character at the campaign’s level, its levels to take', async () => {
    const app = await ravenfordApp();
    await setOptions(app, { startingLevel: 3 });
    const made = await post(
      app,
      `${BASE}/characters`,
      {
        requestId: randomUUID(),
        name: 'Ida Vane',
        choices: {
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
          equipment: { classOption: 'C', backgroundOption: 'B', picks: [] },
          originFeat: 'alert',
          fightingStyle: 'defense',
          invocations: [],
          weaponMasteries: ['greatsword', 'flail', 'javelin'],
          cantrips: [],
          spells: [],
          spellbook: [],
        },
      },
      TOKENS.dm,
    );
    const { characterId } = made.json<CharacterCreatedResponse>();
    const sheet = (
      await get(app, `${BASE}/entities/${characterId}/sheet?perspective=DM`, TOKENS.dm)
    ).json<CharacterSheetResponse>();
    // SRD 5.2.1: the experience of its starting level, here 900 XP for level 3.
    expect(sheet.sheet).toMatchObject({
      classes: [{ classId: 'fighter', level: 1 }],
      experience: 900,
      pendingLevels: 2,
    });
  });

  it('slow a character whose load is past what its Strength carries, where enforced', async () => {
    const app = await ravenfordApp();
    // Elowen's Strength 10 carries 150 lb: four 40 lb mail shirts are more.
    for (let piece = 0; piece < 4; piece += 1) {
      const itemId = `load-mail-${String(piece)}`;
      await dm(app, {
        type: 'CreateEntity',
        entityId: itemId,
        kind: 'item',
        name: 'Mail',
        existsSince: null,
      });
      await dm(app, {
        type: 'GrantItem',
        itemId,
        holderId: ELOWEN,
        catalogId: 'watchman-mail',
        quantity: 1,
      });
    }
    const read = async () => ({
      inventory: (
        await get(app, `${BASE}/entities/${ELOWEN}/inventory?${AS_ELOWEN}`, TOKENS.player)
      ).json<InventoryResponse>(),
      sheet: (
        await get(app, `${BASE}/entities/${ELOWEN}/sheet?${AS_ELOWEN}`, TOKENS.player)
      ).json<CharacterSheetResponse>(),
    });
    const shown = await read();
    expect(shown.inventory.loadSpeedFt).toBeUndefined();
    expect(shown.sheet.derived?.speedFt).toBe(30);
    await setOptions(app, { carrying: 'enforced' });
    const enforced = await read();
    expect(enforced.inventory.loadSpeedFt).toBe(5);
    expect(enforced.sheet.derived).toMatchObject({ speedFt: 5, loadSpeedFt: 5 });
  });
});
