import type { CommandResult, RollFeedResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { TOKENS, get, ravenfordApp } from '../testing/ravenford-app.ts';

/**
 * The World Engine's dice in the roll feed (Stage 510): a real ambush, Elowen's longbow shot (combat
 * dice roll the middle face: 11 on a d20, 5 on a d8), and who sees which roll.
 */
let app: FastifyInstance;
let counter = 0;

async function command(body: Record<string, unknown>, token: string) {
  counter += 1;
  const response = await app.inject({
    method: 'POST',
    url: '/campaigns/ravenford/commands',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    payload: JSON.stringify({ commandId: `rolls-${String(counter)}`, command: body }),
  });
  expect(response.statusCode).toBe(200);
  return response.json<CommandResult>();
}

const feed = async (perspective: string, token: string) =>
  (
    await get(app, `/campaigns/ravenford/rolls?perspective=${perspective}`, token)
  ).json<RollFeedResponse>();

beforeAll(async () => {
  app = await ravenfordApp();
  for (const step of [...ambush.place, ambush.startCombat]) await command(step, TOKENS.dm);
  await command(
    {
      type: 'Attack',
      combatantId: 'elowen-starwhisper',
      attackId: 'longbow',
      targetId: 'creature-589f6668',
    },
    TOKENS.player,
  );
});
afterAll(async () => {
  await app.close();
});

describe('the World Engine’s dice in the roll feed', () => {
  it('shows the player the shot and its damage with the longbow’s d8', async () => {
    const shot = (await feed('PLAYER', TOKENS.player)).rolls.at(-1);
    expect(shot).toMatchObject({
      roller: { entityId: 'elowen-starwhisper', name: 'Elowen Starwhisper' },
      subject: { kind: 'attack', attack: 'longbow' },
      hidden: false,
    });
    const [attack, damage] = shot?.groups ?? [];
    expect(attack).toMatchObject({
      purpose: 'attack',
      dice: [{ sides: 20, value: 11 }],
      result: 'hit',
    });
    expect(attack?.total).toBe(11 + 11);
    expect(damage?.purpose).toBe('damage');
    expect(damage?.dice.every((die) => die.sides === 8)).toBe(true);
    expect(damage?.total).toBe(
      (damage?.dice ?? []).reduce((sum, die) => sum + die.value, 0) + (damage?.modifier ?? 0),
    );
  });

  it('keeps initiative the DM’s', async () => {
    const dm = await feed('DM', TOKENS.dm);
    const initiative = dm.rolls.find((entry) => entry.subject.kind === 'initiative');
    expect(initiative).toMatchObject({ roller: null, hidden: true });
    expect(initiative?.groups.length).toBeGreaterThan(1);
    const player = await feed('PLAYER', TOKENS.player);
    expect(player.rolls.some((entry) => entry.subject.kind === 'initiative')).toBe(false);
    expect(player.rolls.every((entry) => !entry.hidden)).toBe(true);
  });
});
