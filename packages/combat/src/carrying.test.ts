import { DEFAULT_CAMPAIGN_OPTIONS, type CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { ELOWEN, PLAYER, codeOf, roadWorld, startAmbush, type RoadWorld } from './testing/road.ts';

/**
 * Carrying enforced in a fight (SRD 5.2.1, Carrying Capacity; docs/adr/0056-characters-from-the-
 * srd.md §3): Elowen's Strength 10 carries 150 lb; past it she drags the load at 5 ft, past 300 lb
 * she cannot move it. Where the campaign only shows the load, it slows nobody.
 */
const message = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

/** Pieces of 40 lb mail for Elowen to carry. */
async function load(world: RoadWorld, pieces: number) {
  for (let piece = 0; piece < pieces; piece += 1) {
    const itemId = `load-mail-${String(piece)}`;
    await world.dm({
      type: 'CreateEntity',
      entityId: itemId,
      kind: 'item',
      name: itemId,
      existsSince: null,
    });
    await world.dm({
      type: 'GrantItem',
      itemId,
      holderId: ELOWEN,
      catalogId: 'watchman-mail',
      quantity: 1,
    });
  }
}

const enforce = (world: RoadWorld) =>
  world.dm({
    type: 'SetCampaignOptions',
    options: { ...DEFAULT_CAMPAIGN_OPTIONS, carrying: 'enforced' },
  });

const step = (x: number, y: number) => ({
  type: 'MoveCombatant',
  combatantId: ELOWEN,
  path: [{ x, y }],
});

describe('an enforced load in a fight', () => {
  it('lets a character dragging its load move 5 ft a turn', async () => {
    const world = await roadWorld();
    expect(codeOf(await enforce(world))).toBe('accepted');
    await load(world, 4);
    await startAmbush(world);
    expect(codeOf(await world.submit(step(2, 5), PLAYER))).toBe('accepted');
    expect(message(await world.submit(step(2, 4), PLAYER))).toBe('NOT_ENOUGH_MOVEMENT');
  });

  it('keeps a character with more than it can drag where it is', async () => {
    const world = await roadWorld();
    await enforce(world);
    await load(world, 8);
    await startAmbush(world);
    expect(message(await world.submit(step(2, 5), PLAYER))).toBe('NOT_ENOUGH_MOVEMENT');
  });

  it('slows nobody where the campaign only shows the load', async () => {
    const world = await roadWorld();
    await load(world, 8);
    await startAmbush(world);
    expect(codeOf(await world.submit(step(2, 5), PLAYER))).toBe('accepted');
    expect(codeOf(await world.submit(step(2, 4), PLAYER))).toBe('accepted');
  });
});
