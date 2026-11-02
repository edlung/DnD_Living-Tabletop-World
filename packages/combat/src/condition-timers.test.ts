import { resolvePerspective } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  RAIDER_2,
  SHAMAN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
} from './testing/road.ts';
import { encounterView } from './view.ts';

/**
 * How conditions end in a fight (docs/adr/0045-conditions-and-actions.md §2): a duration counted
 * at a named point of a named combatant's turns, a save at the end of the affected creature's own
 * turns, the fight's end, a combatant leaving. The order is Elowen, the Shaman, then the raiders.
 */
const condition = (targetId: string, name: string, details?: Record<string, unknown>) => ({
  type: 'SetCondition',
  targetId,
  condition: name,
  applied: true,
  ...(details ? { details } : {}),
  reason: 'The table says so',
});
const endTurn = (combatantId: string) => ({ type: 'EndTurn', combatantId });

describe('how a condition ends in a fight', () => {
  it('lasts until the named point of the named turn, counting turns down', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const set = await world.dm(
      condition(RAIDER_1, 'frightened', {
        sourceId: ELOWEN,
        until: { turnOf: ELOWEN, at: 'end', turns: 2 },
      }),
    );
    expect(codeOf(set)).toBe('accepted');
    const detail = () =>
      world.encounter().then((e) => e.combatants.find((c) => c.entityId === RAIDER_1));
    expect((await detail())?.conditionDetails?.[0]?.until?.turns).toBe(2);
    // The end of Elowen's turn counts one down.
    await world.submit(endTurn(ELOWEN), PLAYER);
    expect((await detail())?.conditionDetails?.[0]?.until?.turns).toBe(1);
    expect((await world.state()).statBlocks.get(RAIDER_1)?.conditions).toContain('frightened');
    // Around the table to Elowen again; the end of her next turn ends it.
    for (const id of [SHAMAN, RAIDER_1, RAIDER_2, 'creature-6513bec0']) await world.dm(endTurn(id));
    const ended = await world.submit(endTurn(ELOWEN), PLAYER);
    expect(
      (await recorded(world, ended)).filter((e) => e.type === 'ConditionApplied'),
    ).toContainEqual(
      expect.objectContaining({
        payload: { targetId: RAIDER_1, condition: 'frightened', applied: false, cause: 'duration' },
      }),
    );
    expect((await world.state()).statBlocks.get(RAIDER_1)?.conditions).not.toContain('frightened');
    expect((await detail())?.conditionDetails).toBeUndefined();
  });

  it('ends on a save at the end of the creature’s own turn, rolled by the server', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm(condition(ELOWEN, 'paralyzed', { save: { ability: 'wis', dc: 12 } }));
    world.roll(20, 2);
    const failed = await world.submit(endTurn(ELOWEN), PLAYER);
    const save = (await recorded(world, failed)).find((e) => e.type === 'SavingThrowRolled');
    expect(save?.type === 'SavingThrowRolled' && save.payload).toMatchObject({
      creatureId: ELOWEN,
      ability: 'wis',
      dc: 12,
      success: false,
      purpose: 'condition',
    });
    expect((await world.state()).characterSheets.get(ELOWEN)?.conditions).toContain('paralyzed');
    for (const id of [SHAMAN, RAIDER_1, RAIDER_2, 'creature-6513bec0']) await world.dm(endTurn(id));
    world.roll(20, 18);
    // A paralyzed character's turn still ends; her player ends it.
    const saved = await world.submit(endTurn(ELOWEN), PLAYER);
    expect(codeOf(saved)).toBe('accepted');
    expect((await world.state()).characterSheets.get(ELOWEN)?.conditions).not.toContain(
      'paralyzed',
    );
  });

  it('ends with the fight when it had a duration or a save, and stays when it had none', async () => {
    const world = await roadWorld();
    const started = await startAmbush(world);
    await world.dm(condition(RAIDER_1, 'restrained', { save: { ability: 'str', dc: 13 } }));
    await world.dm(condition(RAIDER_2, 'poisoned'));
    const encounterId = (await world.encounter()).encounterId;
    expect(codeOf(started)).toBe('accepted');
    expect(codeOf(await world.dm({ type: 'EndCombat', encounterId }))).toBe('accepted');
    const state = await world.state();
    expect(state.statBlocks.get(RAIDER_1)?.conditions).not.toContain('restrained');
    expect(state.statBlocks.get(RAIDER_2)?.conditions).toContain('poisoned');
  });

  it('ends what a leaving combatant’s turns would have ended', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm(
      condition(RAIDER_1, 'stunned', { until: { turnOf: RAIDER_2, at: 'start', turns: 1 } }),
    );
    expect(
      codeOf(await world.dm({ type: 'RemoveCombatant', entityId: RAIDER_2, reason: 'It fled' })),
    ).toBe('accepted');
    expect((await world.state()).statBlocks.get(RAIDER_1)?.conditions).not.toContain('stunned');
  });

  it('needs a fight and its combatants, and changes only the details when applied again', async () => {
    const world = await roadWorld();
    const early = await world.dm(
      condition(ELOWEN, 'poisoned', { save: { ability: 'con', dc: 10 } }),
    );
    expect(codeOf(early)).toBe('INVALID_COMMAND');
    await startAmbush(world);
    expect(codeOf(await world.dm(condition(ELOWEN, 'charmed', { sourceId: 'maren-ashby' })))).toBe(
      'NOT_A_COMBATANT',
    );
    expect(codeOf(await world.dm(condition(ELOWEN, 'charmed', { sourceId: ELOWEN })))).toBe(
      'INVALID_COMMAND',
    );
    expect(
      codeOf(
        await world.dm({ ...condition(ELOWEN, 'charmed', { sourceId: RAIDER_1 }), applied: false }),
      ),
    ).toBe('INVALID_COMMAND');
    expect(codeOf(await world.dm(condition(ELOWEN, 'charmed', { sourceId: RAIDER_1 })))).toBe(
      'accepted',
    );
    expect(codeOf(await world.dm(condition(ELOWEN, 'charmed', { sourceId: RAIDER_1 })))).toBe(
      'NO_EFFECT',
    );
    const changed = await world.dm(condition(ELOWEN, 'charmed', { sourceId: RAIDER_2 }));
    expect((await recorded(world, changed)).map((e) => e.type)).toEqual([
      'PremisesRecorded',
      'CombatantUpdated',
    ]);
  });

  it('shows the player how it ends, naming only the creatures the player knows', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm(
      condition(ELOWEN, 'frightened', {
        sourceId: RAIDER_1,
        until: { turnOf: SHAMAN, at: 'end', turns: 1 },
        save: { ability: 'wis', dc: 13 },
      }),
    );
    const state = await world.state();
    const access = resolvePerspective(state, PLAYER, { kind: 'PLAYER' });
    if (!access.ok) throw new Error('no perspective');
    const view = encounterView(state, access.perspective);
    const elowen = view?.combatants.find((c) => c.entity.entityId === ELOWEN);
    expect(elowen?.conditionNotes).toEqual([
      {
        condition: 'frightened',
        source: { entityId: RAIDER_1, name: null },
        until: { turnOf: { entityId: SHAMAN, name: null }, at: 'end', turns: 1 },
        save: { ability: 'wis', dc: 13 },
      },
    ]);
  });
});
