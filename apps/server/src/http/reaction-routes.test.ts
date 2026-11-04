import type { CommandResult, EncounterResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { ALL_SECRET_MARKERS, TOKENS, get, ravenfordApp } from '../testing/ravenford-app.ts';

/**
 * Reaction windows over HTTP (docs/adr/0016-reaction-engine.md §4). Every
 * combat die rolls 11, so the order is Elowen, the Raiders, the Shaman, and
 * a Counterspell always counters (the Shaman's save: 11 + 1 against DC 16).
 */
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function shamanCasting(spellId = 'ashen-bolt') {
  const app = await ravenfordApp();
  apps.push(app);
  let counter = 0;
  const command = async (body: Record<string, unknown>, token: string) => {
    counter += 1;
    const response = await app.inject({
      method: 'POST',
      url: '/campaigns/ravenford/commands',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      payload: JSON.stringify({ commandId: `reaction-${String(counter)}`, command: body }),
    });
    return { status: response.statusCode, result: response.json<CommandResult>() };
  };
  const view = async (perspective: string, token: string) => {
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
  for (const step of [
    ...ambush.place,
    ambush.startCombat,
    ...['elowen-starwhisper', 'creature-10fb59d4', 'creature-589f6668', 'creature-6513bec0'].map(
      (combatantId) => ({ type: 'EndTurn', combatantId }),
    ),
    {
      type: 'CastSpell',
      combatantId: 'creature-ae08be99',
      spellId,
      targetId: 'elowen-starwhisper',
    },
  ]) {
    expect((await command(step, TOKENS.dm)).status).toBe(200);
  }
  const dm = await view('DM', TOKENS.dm);
  const windowId = dm.body.encounter?.reactionWindow?.windowId ?? '';
  return { command, view, windowId };
}

describe('the open window in the encounter view', () => {
  it('shows the DM the whole window and the candidate only what they may know', async () => {
    const { view, windowId } = await shamanCasting();
    expect((await view('DM', TOKENS.dm)).body.encounter?.reactionWindow).toMatchObject({
      windowId,
      trigger: { spellId: 'ashen-bolt', targetId: 'elowen-starwhisper' },
      candidates: [{ entityId: 'elowen-starwhisper', response: 'pending' }],
    });
    const player = await view('PLAYER', TOKENS.player);
    expect(player.body.encounter?.reactionWindow).toEqual({
      windowId,
      trigger: {
        kind: 'spell',
        caster: { entityId: 'creature-ae08be99', kind: 'creature', name: null },
        components: ['V', 'S'],
      },
      candidates: [
        {
          entityId: 'elowen-starwhisper',
          response: 'pending',
          choices: ['counterspell', 'ignore'],
        },
      ],
      choices: ['counterspell', 'ignore'],
    });
    expect(player.raw).not.toMatch(/ashen|Ashen|targetId/);
    for (const marker of ALL_SECRET_MARKERS) expect(player.raw).not.toContain(marker);
    expect((await view('PUBLIC', TOKENS.dm)).body.encounter).toBeNull();
    expect((await view('PLAYER', TOKENS.outsider)).status).toBe(404);
  });

  it('does not depend on which spell is suspended', async () => {
    const bolt = await shamanCasting('ashen-bolt');
    const hex = await shamanCasting('binding-hex');
    expect((await bolt.view('PLAYER', TOKENS.player)).raw).toBe(
      (await hex.view('PLAYER', TOKENS.player)).raw,
    );
  });
});

describe('answering over HTTP', () => {
  it('returns the outcome only, refuses late answers, and keeps closing DM-only', async () => {
    const { command, view, windowId } = await shamanCasting();
    const pending = await command(
      { type: 'MoveCombatant', combatantId: 'elowen-starwhisper', path: [{ x: 2, y: 7 }] },
      TOKENS.player,
    );
    expect([pending.status, pending.result.status === 'rejected' && pending.result.code]).toEqual([
      422,
      'REACTION_PENDING',
    ]);
    expect((await command({ type: 'CloseReactionWindow', windowId }, TOKENS.player)).status).toBe(
      403,
    );
    const used = await command(
      {
        type: 'UseReaction',
        combatantId: 'elowen-starwhisper',
        windowId,
        reaction: 'counterspell',
      },
      TOKENS.player,
    );
    expect(used.status).toBe(200);
    expect(used.result).toMatchObject({
      status: 'accepted',
      events: [],
      outcome: { kind: 'UseReaction', windowId, reaction: 'counterspell', countered: true },
    });
    const late = await command(
      { type: 'DeclineReaction', combatantId: 'elowen-starwhisper', windowId },
      TOKENS.player,
    );
    expect(late.status).toBe(422);
    expect(Object.keys(late.result).sort()).toEqual(['code', 'commandId', 'message', 'status']);
    expect(late.result.status === 'rejected' && late.result.code).toBe('REACTION_WINDOW_CLOSED');
    expect((await view('PLAYER', TOKENS.player)).body.encounter?.reactionWindow).toBeNull();
  });
});
