import type { CommandResult, EncounterResponse, EncounterSuggestionResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { ALL_SECRET_MARKERS, TOKENS, get, ravenfordApp } from '../testing/ravenford-app.ts';

/**
 * Combat over HTTP (docs/adr/0015-combat-engine.md §6): the perspective-scoped
 * encounter view and player combat commands. Combat dice roll the middle
 * face, so Elowen (Dex 18) acts first.
 */
let app: FastifyInstance;
let counter = 0;

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  await app.close();
});

async function command(body: Record<string, unknown>, token: string) {
  counter += 1;
  const response = await app.inject({
    method: 'POST',
    url: '/campaigns/ravenford/commands',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    payload: JSON.stringify({ commandId: `combat-${String(counter)}`, command: body }),
  });
  return { status: response.statusCode, result: response.json<CommandResult>() };
}

async function startAmbush() {
  for (const step of [...ambush.place, ambush.startCombat]) {
    expect((await command(step, TOKENS.dm)).status).toBe(200);
  }
}

const encounterFor = async (perspective: string, token: string) => {
  const response = await get(
    app,
    `/campaigns/ravenford/encounter?perspective=${perspective}`,
    token,
  );
  return {
    status: response.statusCode,
    body: response.json<EncounterResponse>(),
    raw: response.body,
  };
};

describe('GET /campaigns/:campaignId/encounter', () => {
  it('is null before combat and for perspectives outside the fight', async () => {
    expect((await encounterFor('PLAYER', TOKENS.player)).body.encounter).toBeNull();
    await startAmbush();
    expect((await encounterFor('PUBLIC', TOKENS.dm)).body.encounter).toBeNull();
    expect((await encounterFor('PLAYER', TOKENS.outsider)).status).toBe(404);
  });

  it('shows the DM initiative and every combatant’s hit points', async () => {
    await startAmbush();
    const { encounter } = (await encounterFor('DM', TOKENS.dm)).body;
    expect(encounter).toMatchObject({ round: 1, currentCombatantId: 'elowen-starwhisper' });
    const shaman = encounter?.combatants.find((c) => c.entity.entityId === 'creature-ae08be99');
    expect(shaman).toMatchObject({
      entity: { name: 'Goblin Shaman' },
      hitPoints: { current: 21, max: 21 },
      initiative: { roll: 11, modifier: 2, total: 13 },
      state: 'up',
    });
  });

  it('shows Elowen’s player the battlefield but only the party’s hit points', async () => {
    await startAmbush();
    const { body, raw } = await encounterFor('PLAYER', TOKENS.player);
    expect(body.perspective).toBe('CHARACTER:elowen-starwhisper');
    const [elowen, ...goblins] = body.encounter?.combatants ?? [];
    expect(elowen).toMatchObject({
      entity: { entityId: 'elowen-starwhisper', name: 'Elowen Starwhisper' },
      hitPoints: { current: 78, max: 78 },
    });
    expect(goblins).toHaveLength(4);
    for (const goblin of goblins) {
      expect(goblin.hitPoints).toBeUndefined();
      expect(goblin.initiative).toBeUndefined();
      expect(goblin.entity.name).toBeNull();
    }
    expect(body.encounter?.battlefield.cover).toContainEqual({
      x: 12,
      y: 6,
      level: 'three-quarters',
    });
    for (const marker of ALL_SECRET_MARKERS) expect(raw).not.toContain(marker);
    expect(raw).not.toContain('initiative');
    expect(raw).not.toContain('armorClass');
  });
});

describe('player combat commands', () => {
  it('returns the attack outcome without events, and refusals without details', async () => {
    await startAmbush();
    const shot = await command(
      {
        type: 'Attack',
        combatantId: 'elowen-starwhisper',
        attackId: 'longbow',
        targetId: 'creature-589f6668',
      },
      TOKENS.player,
    );
    expect(shot.status).toBe(200);
    expect(shot.result).toMatchObject({
      status: 'accepted',
      events: [],
      outcome: { kind: 'Attack', d20: [11], attackTotal: 22, hit: true, damage: 9 },
    });
    const goblin = await command(
      { type: 'EndTurn', combatantId: 'creature-ae08be99' },
      TOKENS.player,
    );
    expect(goblin.status).toBe(403);
    const fireball = await command(
      {
        type: 'CastSpell',
        combatantId: 'elowen-starwhisper',
        spellId: 'fireball',
        point: { x: 10, y: 6 },
      },
      TOKENS.player,
    );
    expect(fireball.status).toBe(422);
    expect(fireball.result).toMatchObject({ code: 'ILLEGAL_ACTION', message: 'NO_ACTION' });
    expect(Object.keys(fireball.result).sort()).toEqual(['code', 'commandId', 'message', 'status']);
  });

  it('lets only the DM start or end combat', async () => {
    const start = await command(ambush.startCombat, TOKENS.player);
    expect(start.status).toBe(403);
    await startAmbush();
    const { encounter } = (await encounterFor('DM', TOKENS.dm)).body;
    const end = await command(
      { type: 'EndCombat', encounterId: encounter?.encounterId },
      TOKENS.player,
    );
    expect(end.status).toBe(403);
    expect(
      (await command({ type: 'EndCombat', encounterId: encounter?.encounterId }, TOKENS.dm)).status,
    ).toBe(200);
    expect((await encounterFor('DM', TOKENS.dm)).body.encounter).toBeNull();
  });
});

describe('GET /campaigns/:campaignId/encounter/suggestion', () => {
  const url = '/campaigns/ravenford/encounter/suggestion';

  it('is the DM’s, a commander’s for their creature only, and null outside combat', async () => {
    expect((await get(app, url)).statusCode).toBe(401);
    expect((await get(app, url, TOKENS.outsider)).statusCode).toBe(404);
    expect(
      (await get(app, '/campaigns/elsewhere/encounter/suggestion', TOKENS.dm)).statusCode,
    ).toBe(404);
    // Only a creature's commander reads its turn's suggestion (ADR 0044 §7).
    expect((await get(app, url, TOKENS.player)).statusCode).toBe(403);
    expect((await get(app, url, TOKENS.dm)).json<EncounterSuggestionResponse>()).toEqual({
      suggestion: null,
    });
  });

  it('suggests nothing while a reaction window is open (G04-M01)', async () => {
    await startAmbush();
    const windowNow = async () =>
      (
        await get(app, '/campaigns/ravenford/encounter?perspective=DM', TOKENS.dm)
      ).json<EncounterResponse>().encounter?.reactionWindow?.windowId;
    // Play suggested turns (Elowen only ends hers) until the Shaman's cast opens a window.
    let pending: string | undefined;
    for (let step = 0; step < 40 && !pending; step += 1) {
      const { suggestion } = (await get(app, url, TOKENS.dm)).json<EncounterSuggestionResponse>();
      const next = suggestion?.command ?? { type: 'EndTurn', combatantId: 'elowen-starwhisper' };
      expect((await command({ ...next }, TOKENS.dm)).status).toBe(200);
      pending = await windowNow();
    }
    expect(pending).toBeDefined();
    expect((await get(app, url, TOKENS.dm)).json<EncounterSuggestionResponse>()).toEqual({
      suggestion: null,
    });
    // Closed, the creature may act again.
    expect(
      (await command({ type: 'CloseReactionWindow', windowId: pending }, TOKENS.dm)).status,
    ).toBe(200);
    const { suggestion } = (await get(app, url, TOKENS.dm)).json<EncounterSuggestionResponse>();
    expect(suggestion).not.toBeNull();
    expect((await command({ ...suggestion?.command }, TOKENS.dm)).status).toBe(200);
  });

  it('suggests a creature’s action, which the DM submits as any command', async () => {
    await startAmbush();
    expect(
      (await command({ type: 'EndTurn', combatantId: 'elowen-starwhisper' }, TOKENS.player)).status,
    ).toBe(200);
    const { suggestion } = (await get(app, url, TOKENS.dm)).json<EncounterSuggestionResponse>();

    expect(suggestion?.explanation).toEqual(expect.any(String));
    const submitted = await command({ ...suggestion?.command }, TOKENS.dm);
    expect(submitted.result.status).toBe('accepted');
  });
});
