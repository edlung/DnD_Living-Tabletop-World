import { randomUUID } from 'node:crypto';

import type { CraftingResponse } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { get, post, ravenfordApp, seededEngine, TOKENS } from '../testing/ravenford-app.ts';

/**
 * Crafting over HTTP (docs/adr/0057-encounters-maps-loot.md §9), in the ADR 0009 order: the DM reads
 * every project, Elowen her own and what she can make — with the Herbalism Kit she carries and
 * knows, a Potion of Healing in a day for 25 GP — and the spells she could scribe, by Arcana; the
 * party's view and an outsider are answered as not found.
 */
const CRAFTING = '/campaigns/ravenford/crafting';
const ELOWEN = 'elowen-starwhisper';
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

async function craftingApp() {
  const engine = await seededEngine();
  const state = (await engine.load('ravenford'))?.state;
  const sheet = state?.characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('Elowen has no sheet');
  const result = await engine.execute({
    commandId: 'test.crafter',
    campaignId: 'ravenford',
    actor: DM,
    command: {
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: {
        ...sheet,
        tools: ['srd-herbalism-kit'],
        skills: {
          ...sheet.skills,
          proficient: [...new Set([...sheet.skills.proficient, 'arcana'])],
        },
      },
    },
  });
  expect(result.status).toBe('accepted');
  const app = await ravenfordApp(engine);
  for (const [catalogId, quantity] of [
    ['srd-herbalism-kit', 1],
    ['gold-crown', 30],
  ] as const) {
    const given = await post(
      app,
      `/campaigns/ravenford/items/catalog/${catalogId}/give`,
      { requestId: randomUUID(), holderId: ELOWEN, quantity },
      TOKENS.dm,
    );
    expect(given.statusCode).toBe(200);
  }
  return app;
}

describe('GET …/crafting', () => {
  it('answers in the ADR 0009 order', async () => {
    const app = await ravenfordApp(await seededEngine());
    expect((await get(app, `${CRAFTING}?perspective=DM`)).statusCode).toBe(401);
    expect((await get(app, `${CRAFTING}?perspective=DM&x=1`, TOKENS.dm)).statusCode).toBe(400);
    expect((await get(app, `${CRAFTING}?perspective=DM`, TOKENS.outsider)).statusCode).toBe(404);
    expect((await get(app, `${CRAFTING}?perspective=PARTY`, TOKENS.player)).statusCode).toBe(404);
    const dm = (await get(app, `${CRAFTING}?perspective=DM`, TOKENS.dm)).json<CraftingResponse>();
    expect(dm.projects).toEqual([]);
  });

  it('shows a character what it can make and scribe, then the project begun', async () => {
    const app = await craftingApp();
    const read = async (token: string, perspective: string) => {
      const response = await get(app, `${CRAFTING}?perspective=${perspective}`, token);
      expect(response.statusCode).toBe(200);
      return response.json<CraftingResponse>();
    };
    const shown = await read(TOKENS.player, 'PLAYER');
    const potion = shown.recipes.find((one) => one.catalogId === 'srd-potion-of-healing');
    expect(potion).toMatchObject({
      toolId: 'srd-herbalism-kit',
      toolName: 'Herbalism Kit',
      days: 1,
      materialsCp: 2_500,
    });
    // Her prepared spells, by level, each with its scroll's days and cost.
    expect(shown.scrolls.length).toBeGreaterThan(0);
    const levels = shown.scrolls.map((one) => one.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(shown.busy).toBe(false);
    const started = await post(
      app,
      '/campaigns/ravenford/commands',
      {
        commandId: `test.${randomUUID()}`,
        command: {
          type: 'StartCrafting',
          characterId: ELOWEN,
          catalogId: 'srd-potion-of-healing',
        },
      },
      TOKENS.player,
    );
    expect(started.json<{ status: string }>().status).toBe('accepted');
    const busy = await read(TOKENS.player, 'PLAYER');
    expect(busy.busy).toBe(true);
    expect(busy.projects).toMatchObject([{ hoursNeeded: 8, hoursDone: 0, workers: 1 }]);
    expect((await read(TOKENS.dm, 'DM')).projects).toHaveLength(1);
  });
});
