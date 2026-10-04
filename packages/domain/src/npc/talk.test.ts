import { describe, expect, it } from 'vitest';

import {
  DM,
  ELOWEN,
  OUTSIDER,
  PLAYER,
  investigationWorld,
  type InvestigationWorld,
} from '../investigation/testing/world.ts';
import type { Actor } from '../kernel/actor.ts';
import { checkTalk } from './talk.ts';

/**
 * Talk (docs/adr/0020-npc-intelligence.md §1, §3): no command, so its own
 * check, authorized as a player command is and with `AskAbout`'s
 * preconditions in the same order.
 */
async function talk(world: InvestigationWorld, npcId: string, actor: Actor = PLAYER) {
  const result = checkTalk(await world.state(), actor, ELOWEN, npcId);
  return result.ok ? 'ok' : result.code;
}

describe('checkTalk', () => {
  it('lets the controlling player or the DM talk to a present, living NPC', async () => {
    const world = await investigationWorld();
    expect(await talk(world, 'mira-vale')).toBe('ok');
    expect(await talk(world, 'mira-vale', DM)).toBe('ok');
  });

  it('refuses anyone else before looking at the world', async () => {
    const world = await investigationWorld();
    expect(await talk(world, 'mira-vale', OUTSIDER)).toBe('FORBIDDEN');
    expect(await talk(world, 'no-such-npc', OUTSIDER)).toBe('FORBIDDEN');
  });

  it('answers an unknown NPC exactly like a nonexistent one', async () => {
    const world = await investigationWorld();
    await world.submit(
      {
        type: 'CreateEntity',
        entityId: 'hidden-npc',
        kind: 'npc',
        name: 'Hidden',
        existsSince: null,
        placement: { locationId: 'golden-stag-inn', since: null },
      },
      DM,
    );
    expect(await talk(world, 'hidden-npc')).toBe('ENTITY_NOT_FOUND');
    expect(await talk(world, 'no-such-npc')).toBe('ENTITY_NOT_FOUND');
  });

  it('needs the NPC here, alive, and an NPC', async () => {
    const world = await investigationWorld();
    expect(await talk(world, 'orin-stonebeard')).toBe('NOT_PRESENT');
    expect(await talk(world, 'market-square')).toBe('NO_EFFECT');
    expect(await talk(world, ELOWEN)).toBe('NO_EFFECT');
    await world.submit({ type: 'ChangeEntityStatus', entityId: 'mira-vale', status: 'dead' }, DM);
    expect(await talk(world, 'mira-vale')).toBe('TARGET_DEAD');
  });

  it('needs a speaker who can speak', async () => {
    const world = await investigationWorld();
    const state = await world.state();
    const sheet = state.characterSheets.get(ELOWEN);
    if (!sheet) throw new Error('missing sheet');
    await world.submit(
      {
        type: 'SetCharacterSheet',
        entityId: ELOWEN,
        sheet: { ...sheet, conditions: ['incapacitated'] },
      },
      DM,
    );
    expect(await talk(world, 'mira-vale')).toBe('ACTOR_INCAPACITATED');
    await world.submit({ type: 'ChangeEntityStatus', entityId: ELOWEN, status: 'dead' }, DM);
    expect(await talk(world, 'mira-vale')).toBe('ACTOR_DEAD');
  });
});
