import { resolvePerspective } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { verifyHistory } from '../testing/verify.ts';
import { encounterView } from '../view.ts';
import {
  DM,
  ELOWEN,
  PLAYER,
  RAIDER_1,
  SHAMAN,
  codeOf,
  openWindowId,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from '../testing/road.ts';

/**
 * Opportunity attacks and the readied attack (docs/adr/0046-reactions-beyond-counterspell.md §2,
 * §5), through the World Engine. Elowen stands at (2,6) and acts first, then the Shaman and the
 * Raiders; here Raider 1 starts beside her, at (3,6).
 */
const beside = (command: { combatants: { entityId: string }[] } & Record<string, unknown>) => ({
  ...command,
  combatants: command.combatants.map((c) =>
    c.entityId === RAIDER_1 ? { ...c, position: { x: 3, y: 6 } } : c,
  ),
});
const message = (result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  result.status === 'rejected' ? result.message : result.status;
const combatant = async (world: RoadWorld, entityId: string) =>
  (await world.encounter()).combatants.find((c) => c.entityId === entityId);
const westward = {
  type: 'MoveCombatant',
  combatantId: ELOWEN,
  path: [
    { x: 1, y: 6 },
    { x: 0, y: 6 },
  ],
};

describe('opportunity attacks', () => {
  it('leaving a raider’s reach stops the move until it answers; then the move goes on', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, beside);
    expect(codeOf(await world.submit(westward, PLAYER))).toBe('accepted');
    // Her first step leaves the reach: she waits where she stood, and so does the fight.
    expect((await combatant(world, ELOWEN))?.position).toEqual({ x: 2, y: 6 });
    const windowId = await openWindowId(world);
    const window = (await world.state()).reactionWindows.get(windowId);
    expect(window?.trigger).toMatchObject({ kind: 'move', moverId: ELOWEN, rest: westward.path });
    expect(window?.candidates).toEqual([
      { entityId: RAIDER_1, response: 'pending', reactions: ['opportunity-attack'] },
    ]);
    expect(codeOf(await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER))).toBe(
      'REACTION_PENDING',
    );
    // The DM answers for the raider: its scimitar hits for 4 + 2.
    world.roll(20, 15);
    world.roll(6, 4);
    const swing = await world.dm({
      type: 'UseReaction',
      combatantId: RAIDER_1,
      windowId,
      reaction: 'opportunity-attack',
      attackId: 'scimitar',
    });
    expect(codeOf(swing)).toBe('accepted');
    const performed = (await recorded(world, swing)).find((e) => e.type === 'AttackPerformed');
    expect(performed?.type === 'AttackPerformed' && performed.payload).toMatchObject({
      attackerId: RAIDER_1,
      targetId: ELOWEN,
      attackId: 'scimitar',
      by: 'opportunity',
      hit: true,
    });
    expect((await world.state()).characterSheets.get(ELOWEN)?.hitPoints.current).toBe(78 - 6);
    expect((await combatant(world, RAIDER_1))?.turn.reactionAvailable).toBe(false);
    const elowen = await combatant(world, ELOWEN);
    expect(elowen?.position).toEqual({ x: 0, y: 6 });
    expect(elowen?.turn.movementUsedFt).toBe(10);
  });

  it('Disengage lets her leave without a window; so does a raider that cannot see her', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, beside);
    await world.submit({ type: 'TakeAction', combatantId: ELOWEN, action: 'disengage' }, PLAYER);
    expect(codeOf(await world.submit(westward, PLAYER))).toBe('accepted');
    expect((await world.state()).reactionWindows.size).toBe(0);
    expect((await combatant(world, ELOWEN))?.position).toEqual({ x: 0, y: 6 });

    const unseen = await roadWorld();
    await startAmbush(unseen, undefined, beside);
    await unseen.dm({
      type: 'SetCondition',
      targetId: ELOWEN,
      condition: 'invisible',
      applied: true,
      reason: 'A potion of invisibility',
    });
    expect(codeOf(await unseen.submit(westward, PLAYER))).toBe('accepted');
    expect((await unseen.state()).reactionWindows.size).toBe(0);
  });

  it('a raider leaving her reach asks her player; she lets it go, or strikes unarmed', async () => {
    for (const answer of ['decline', 'strike'] as const) {
      const world = await roadWorld();
      await startAmbush(world, undefined, beside);
      await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
      await world.dm({ type: 'EndTurn', combatantId: SHAMAN });
      // Raider 1's turn: it steps away east, out of her reach.
      const away = { type: 'MoveCombatant', combatantId: RAIDER_1, path: [{ x: 4, y: 6 }] };
      expect(codeOf(await world.dm(away))).toBe('accepted');
      const windowId = await openWindowId(world);
      expect((await combatant(world, RAIDER_1))?.position).toEqual({ x: 3, y: 6 });
      if (answer === 'decline') {
        const declined = await world.submit(
          { type: 'DeclineReaction', combatantId: ELOWEN, windowId },
          PLAYER,
        );
        expect(codeOf(declined)).toBe('accepted');
      } else {
        // Her only melee is an Unarmed Strike: Strength +0 and proficiency, 1 bludgeoning.
        world.roll(20, 15);
        const struck = await world.submit(
          {
            type: 'UseReaction',
            combatantId: ELOWEN,
            windowId,
            reaction: 'opportunity-attack',
            attackId: 'unarmed-strike',
          },
          PLAYER,
        );
        expect(codeOf(struck)).toBe('accepted');
        const applied = (await recorded(world, struck)).find((e) => e.type === 'DamageApplied');
        expect(applied?.type === 'DamageApplied' && applied.payload.amount).toBe(1);
      }
      expect((await combatant(world, RAIDER_1))?.position).toEqual({ x: 4, y: 6 });
    }
  });

  it('the DM’s close lets the move go on, and the unanswered keep their Reaction', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, beside);
    await world.submit(westward, PLAYER);
    const windowId = await openWindowId(world);
    expect(codeOf(await world.dm({ type: 'CloseReactionWindow', windowId }))).toBe('accepted');
    expect((await combatant(world, ELOWEN))?.position).toEqual({ x: 0, y: 6 });
    expect((await combatant(world, RAIDER_1))?.turn.reactionAvailable).toBe(true);
    expect((await world.state()).reactionWindows.get(windowId)?.candidates[0]?.response).toBe(
      'expired',
    );
  });
});

describe('undoing a move’s window (ADR 0016 §3)', () => {
  it('undoes the answer first, reopening the window with the move held; then the move', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, beside);
    const moved = await world.submit(westward, PLAYER);
    const windowId = await openWindowId(world);
    world.roll(20, 15);
    world.roll(6, 4);
    const swing = await world.dm({
      type: 'UseReaction',
      combatantId: RAIDER_1,
      windowId,
      reaction: 'opportunity-attack',
      attackId: 'scimitar',
    });
    const undo = (result: typeof moved) =>
      world.dm({ type: 'UndoCommand', targetCommandId: result.commandId ?? '' });
    expect(codeOf(await undo(moved))).toBe('UNDO_UNSAFE');
    expect(codeOf(await undo(swing))).toBe('accepted');
    let state = await world.state();
    expect(state.reactionWindows.get(windowId)?.status).toBe('open');
    expect(state.characterSheets.get(ELOWEN)?.hitPoints.current).toBe(78);
    expect((await combatant(world, ELOWEN))?.position).toEqual({ x: 2, y: 6 });
    expect((await combatant(world, RAIDER_1))?.turn.reactionAvailable).toBe(true);
    expect(codeOf(await undo(moved))).toBe('accepted');
    state = await world.state();
    expect(state.reactionWindows.has(windowId)).toBe(false);
    expect((await combatant(world, ELOWEN))?.turn.movementUsedFt).toBe(0);
    await verifyHistory(world);
  });
});

describe('what each sees of a move’s window', () => {
  it('the DM answers for creatures; a player sees their own choices, the mover only that it waits', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, beside);
    const viewOf = async (actor: typeof DM, request: Parameters<typeof resolvePerspective>[2]) => {
      const state = await world.state();
      const access = resolvePerspective(state, actor, request);
      if (!access.ok) throw new Error(access.reason);
      return encounterView(state, access.perspective)?.reactionWindow;
    };
    // Her own move: the raider is asked, and she learns only that her move waits.
    await world.submit(westward, PLAYER);
    const windowId = await openWindowId(world);
    expect(await viewOf(DM, { kind: 'DM' })).toMatchObject({
      trigger: { kind: 'move', mover: { entityId: ELOWEN, name: 'Elowen Starwhisper' } },
      candidates: [
        {
          entityId: RAIDER_1,
          response: 'pending',
          choices: ['opportunity-attack', 'ignore'],
          attacks: [{ attackId: 'scimitar', name: 'Scimitar' }],
        },
      ],
    });
    const mover = await viewOf(PLAYER, { kind: 'PLAYER' });
    expect(mover).toEqual({
      windowId,
      trigger: {
        kind: 'move',
        mover: { entityId: ELOWEN, kind: 'character', name: 'Elowen Starwhisper' },
        at: { x: 2, y: 6 },
      },
      candidates: [],
      choices: [],
    });
    expect(JSON.stringify(mover)).not.toContain(RAIDER_1);
  });
});

describe('the readied attack', () => {
  it('is made off its holder’s turn, with the Reaction, once', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const ready = {
      type: 'TakeAction',
      combatantId: ELOWEN,
      action: 'ready',
      targetId: RAIDER_1,
      readied: { attackId: 'longbow', trigger: 'When it leaves the wagon' },
    };
    expect(codeOf(await world.submit(ready, PLAYER))).toBe('accepted');
    const fire = { type: 'MakeReadiedAttack', combatantId: ELOWEN };
    // Not on her own turn: the moment comes on another's.
    expect(message(await world.submit(fire, PLAYER))).toBe('NO_VALID_TRIGGER');
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
    world.roll(20, 15);
    world.roll(8, 5);
    const loosed = await world.submit(fire, PLAYER);
    expect(codeOf(loosed)).toBe('accepted');
    const performed = (await recorded(world, loosed)).find((e) => e.type === 'AttackPerformed');
    expect(performed?.type === 'AttackPerformed' && performed.payload).toMatchObject({
      attackerId: ELOWEN,
      targetId: RAIDER_1,
      attackId: 'longbow',
      by: 'readied',
    });
    const elowen = await combatant(world, ELOWEN);
    expect(elowen?.turn.readied).toBeUndefined();
    expect(elowen?.turn.reactionAvailable).toBe(false);
    expect(message(await world.submit(fire, PLAYER))).toBe('NO_VALID_TRIGGER');
  });
});
