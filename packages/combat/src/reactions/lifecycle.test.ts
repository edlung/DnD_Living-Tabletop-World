import type { CommandResult } from '@ltw/contracts';
import { resolvePerspective, type WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { encounterView } from '../view.ts';
import { counterspell, ignore, shamanCastsAtElowen } from '../testing/reactions.ts';
import {
  DM,
  ELOWEN,
  PLAYER,
  RAIDER_1,
  SHAMAN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
} from '../testing/road.ts';

/**
 * The mandatory Ravenford case (docs/adr/0016-reaction-engine.md §1): the
 * Goblin Shaman casts at Elowen, 50 ft away, and a Counterspell window opens.
 * Elowen's Wizard save DC is 16; the Shaman's Constitution save is +1.
 */
const outcomeOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.code : result.outcome;
const window = (state: WorldState, id: string) => state.reactionWindows.get(id);

describe('opening a window', () => {
  it('suspends the spell: the action is spent, nothing else happens yet', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const before = await world.state();
    const { trigger, windowId } = await shamanCastsAtElowen(world);
    expect((await recorded(world, trigger)).map((e) => e.type)).toEqual([
      'PremisesRecorded',
      'CombatantUpdated',
      'ReactionWindowOpened',
    ]);
    expect(outcomeOf(trigger)).toEqual({
      kind: 'CastSpell',
      spellId: 'ashen-bolt',
      results: [],
      discovered: [],
      awaitingReaction: true,
    });
    const state = await world.state();
    expect(window(state, windowId)).toMatchObject({
      status: 'open',
      round: 1,
      trigger: {
        casterId: SHAMAN,
        spellId: 'ashen-bolt',
        components: ['V', 'S'],
        targetId: ELOWEN,
      },
      candidates: [{ entityId: ELOWEN, response: 'pending' }],
      openedBy: trigger.commandId,
      closedBy: null,
    });
    // Traceability: why every other combatant could not react.
    expect(window(state, windowId)?.ineligible).toEqual([
      { entityId: RAIDER_1, reason: 'NOT_KNOWN' },
      { entityId: 'goblin-raider-2', reason: 'NOT_KNOWN' },
      { entityId: 'goblin-raider-3', reason: 'NOT_KNOWN' },
    ]);
    expect(state.characterSheets.get(ELOWEN)).toEqual(before.characterSheets.get(ELOWEN));
    expect(state.encounter?.combatants.find((c) => c.entityId === SHAMAN)?.turn.actionUsed).toBe(
      true,
    );
  });

  it('never opens for the caster’s own spell or outside combat', async () => {
    const world = await roadWorld();
    const outside = await world.submit({
      type: 'CastSpell',
      combatantId: ELOWEN,
      spellId: 'detect-magic',
    });
    expect((await recorded(world, outside)).map((e) => e.type)).not.toContain(
      'ReactionWindowOpened',
    );
    await startAmbush(world);
    const own = await world.submit({
      type: 'CastSpell',
      combatantId: ELOWEN,
      spellId: 'hunters-mark',
      targetId: RAIDER_1,
    });
    expect((await recorded(world, own)).map((e) => e.type)).not.toContain('ReactionWindowOpened');
    expect((await world.state()).reactionWindows.size).toBe(0);
  });
});

describe('Counterspell', () => {
  it('counters on a failed save: no effect, the slot and Reaction are spent', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { windowId } = await shamanCastsAtElowen(world);
    world.roll(20, 5);
    const used = await world.submit(counterspell(ELOWEN, windowId));
    expect(outcomeOf(used)).toEqual({
      kind: 'UseReaction',
      windowId,
      reaction: 'counterspell',
      countered: true,
    });
    const events = await recorded(world, used);
    expect(events.map((e) => e.type)).toEqual([
      'PremisesRecorded',
      'ReactionUsed',
      'SpellCast',
      'CharacterSheetSet',
      'CombatantUpdated',
      'SavingThrowRolled',
      'ReactionWindowResolved',
    ]);
    expect(events.find((e) => e.type === 'SavingThrowRolled')?.payload).toMatchObject({
      creatureId: SHAMAN,
      ability: 'con',
      dc: 16,
      total: 6,
      success: false,
      purpose: 'counterspell',
    });
    const state = await world.state();
    expect(window(state, windowId)).toMatchObject({
      status: 'countered',
      candidates: [{ entityId: ELOWEN, response: 'used' }],
      closedBy: used.commandId,
    });
    const elowen = state.characterSheets.get(ELOWEN);
    expect(elowen?.hitPoints.current).toBe(78);
    expect(elowen?.spellSlots.expended[2]).toBe(1);
    expect(state.encounter?.combatants.find((c) => c.entityId === ELOWEN)?.turn).toMatchObject({
      reactionAvailable: false,
      slotExpendedThisTurn: true,
    });
    // The Shaman's action stays spent.
    const again = await world.dm({
      type: 'CastSpell',
      combatantId: SHAMAN,
      spellId: 'binding-hex',
      targetId: ELOWEN,
    });
    expect(again.status === 'rejected' && again.message).toBe('NO_ACTION');
  });

  it('on a successful save is spent without effect, and the spell resolves in the same command', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { windowId } = await shamanCastsAtElowen(world);
    world.roll(20, 15, 15);
    world.roll(8, 4, 4);
    const used = await world.submit(counterspell(ELOWEN, windowId, { slotLevel: 4 }));
    expect(outcomeOf(used)).toMatchObject({ countered: false });
    const types = (await recorded(world, used)).map((e) => e.type);
    expect(types.slice(0, 7)).toEqual([
      'PremisesRecorded',
      'ReactionUsed',
      'SpellCast',
      'CharacterSheetSet',
      'CombatantUpdated',
      'SavingThrowRolled',
      'ReactionWindowResolved',
    ]);
    expect(types.slice(7)).toEqual(
      expect.arrayContaining(['SpellCast', 'AttackPerformed', 'DamageApplied']),
    );
    const state = await world.state();
    expect(window(state, windowId)?.status).toBe('proceeded');
    const elowen = state.characterSheets.get(ELOWEN);
    expect(elowen?.spellSlots.expended[3]).toBe(1);
    expect(elowen?.hitPoints.current).toBe(70);
  });

  it('is rejected by the Rules when invalid', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const direct = await world.submit({
      type: 'CastSpell',
      combatantId: ELOWEN,
      spellId: 'counterspell',
    });
    expect(direct.status === 'rejected' && direct.message).toBe('NO_VALID_TRIGGER');
    const { windowId } = await shamanCastsAtElowen(world);
    const low = await world.submit(counterspell(ELOWEN, windowId, { slotLevel: 2 }));
    expect(low.status === 'rejected' && [low.code, low.message]).toEqual([
      'ILLEGAL_ACTION',
      'SLOT_TOO_LOW',
    ]);
    expect((await world.state()).reactionWindows.get(windowId)?.status).toBe('open');
  });
});

describe('ignoring', () => {
  it('lets the spell happen with the answer’s dice, spending nothing', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { windowId } = await shamanCastsAtElowen(world);
    world.roll(20, 15);
    world.roll(8, 4, 4);
    const ignored = await world.submit(ignore(ELOWEN, windowId));
    expect(outcomeOf(ignored)).toEqual({ kind: 'DeclineReaction', windowId });
    const state = await world.state();
    expect(window(state, windowId)).toMatchObject({
      status: 'proceeded',
      candidates: [{ entityId: ELOWEN, response: 'declined' }],
    });
    expect(state.characterSheets.get(ELOWEN)?.hitPoints.current).toBe(70);
    expect(state.characterSheets.get(ELOWEN)?.spellSlots.expended).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(
      state.encounter?.combatants.find((c) => c.entityId === ELOWEN)?.turn.reactionAvailable,
    ).toBe(true);
  });
});

describe('what each perspective sees', () => {
  it('shows the DM everything, the candidate only the caster and components', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { windowId } = await shamanCastsAtElowen(world);
    let state = await world.state();
    const view = (actor: typeof DM, request: Parameters<typeof resolvePerspective>[2]) => {
      const access = resolvePerspective(state, actor, request);
      if (!access.ok) throw new Error(access.reason);
      return encounterView(state, access.perspective)?.reactionWindow;
    };
    expect(view(DM, { kind: 'DM' })).toEqual({
      windowId,
      trigger: {
        kind: 'spell',
        caster: { entityId: SHAMAN, kind: 'creature', name: 'Goblin Shaman' },
        components: ['V', 'S'],
        spellId: 'ashen-bolt',
        targetId: ELOWEN,
        point: null,
      },
      candidates: [{ entityId: ELOWEN, response: 'pending' }],
      choices: [],
    });
    const player = view(PLAYER, { kind: 'PLAYER' });
    expect(player).toEqual({
      windowId,
      trigger: {
        kind: 'spell',
        caster: { entityId: SHAMAN, kind: 'creature', name: null },
        components: ['V', 'S'],
      },
      candidates: [{ entityId: ELOWEN, response: 'pending' }],
      choices: ['counterspell', 'ignore'],
    });
    expect(JSON.stringify(player)).not.toMatch(/ashen|Ashen|targetId|dc/);
    expect(codeOf(await world.submit(ignore(ELOWEN, windowId)))).toBe('accepted');
    state = await world.state();
    expect(view(DM, { kind: 'DM' })).toBeNull();
  });
});
