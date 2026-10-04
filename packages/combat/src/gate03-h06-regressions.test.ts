import type { CommandResult } from '@ltw/contracts';
import { openReactionWindow, type WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { SEREN, addSeren, cast, withSeren } from './testing/reactions.ts';
import {
  AMBUSH,
  CAMPAIGN,
  ELOWEN,
  SHAMAN,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * G03-H06 (reviews/ASTRA_GATE_03_RETEST_2.md):
 * `outsider_healing_does_not_reveal_hidden_reaction_window`. Elowen stands on
 * the Old Trade Road outside a fight between Seren and the goblins. What her
 * player observes from any spell must not depend on whether a reaction window
 * is open, and nothing she does may change what an open window depends on.
 * By owner decision (ADR 0015, Gate 03 retest 2 amendment) a character outside
 * a fight cannot target its combatants: with a fight running she learns that
 * a creature she sees is fighting, in every phase of that fight alike.
 */
type Phase = 'no fight' | 'a fight' | 'a fight with an open window';
const PHASES: Phase[] = ['no fight', 'a fight', 'a fight with an open window'];
const BYSTANDER = 'h06-bystander';
const PROBES = [
  ['healing-word', SHAMAN],
  ['hunters-mark', SHAMAN],
  ['healing-word', ELOWEN],
  ['healing-word', BYSTANDER],
  ['hunters-mark', BYSTANDER],
  ['detect-magic', null],
] as const;
type Probe = (typeof PROBES)[number];

const accepted = async (sent: Promise<CommandResult>) => {
  const result = await sent;
  expect(result.status, JSON.stringify(result)).toBe('accepted');
  return result;
};

/** The road with Seren, a bystander, and the goblins; then a fresh engine on its store. */
async function arrange(phase: Phase, injured: boolean): Promise<RoadWorld> {
  const world = await roadWorld();
  await addSeren(world);
  await accepted(
    world.dm({
      type: 'CreateEntity',
      entityId: BYSTANDER,
      kind: 'npc',
      name: 'Bystander',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    }),
  );
  if (injured) {
    const state = await world.state();
    const block = state.statBlocks.get(SHAMAN);
    const sheet = state.characterSheets.get(ELOWEN);
    if (!block || !sheet) throw new Error('seed changed');
    const statBlock = { ...block, hitPoints: { ...block.hitPoints, current: 9 } };
    await accepted(world.dm({ type: 'SetStatBlock', entityId: SHAMAN, statBlock }));
    const wounded = { ...sheet, hitPoints: { ...sheet.hitPoints, current: 40 } };
    await accepted(world.dm({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet: wounded }));
  }
  if (phase === 'no fight') {
    for (const place of AMBUSH.place) await accepted(world.dm(place));
  } else {
    // Elowen is placed on the road with everyone but left out; the Shaman acts first.
    await startAmbush(world, [1, 2, 3, 20, 5], (command: typeof AMBUSH.startCombat) =>
      withSeren()({
        ...command,
        combatants: command.combatants.filter((c) => c.entityId !== ELOWEN),
      }),
    );
  }
  if (phase === 'a fight with an open window') {
    await accepted(world.dm(cast(SHAMAN, 'ashen-bolt', { targetId: SEREN })));
    expect(openReactionWindow(await world.state())?.candidates.map((c) => c.entityId)).toEqual([
      SEREN,
    ]);
  }
  // A fresh process: a second engine over the same store.
  return roadWorld({ shared: { store: world.store, namespace: 5 } });
}

/** What Elowen's player sees of a result: status, code and message, or the outcome. */
function seen(result: CommandResult): unknown {
  if (result.status === 'rejected') {
    return { status: result.status, code: result.code, message: result.message };
  }
  const outcome = structuredClone(result.outcome) as Record<string, unknown> | undefined;
  if (outcome && Array.isArray(outcome['discovered'])) {
    outcome['discovered'] = outcome['discovered'].length;
  }
  return { status: result.status, outcome };
}

/** Everything an open window depends on: every combatant, the encounter, the clock. */
function windowDependencies(state: WorldState): unknown {
  const ids = state.encounter?.combatants.map((c) => c.entityId) ?? [];
  return {
    clock: state.clock,
    encounter: state.encounter,
    windows: [...state.reactionWindows.values()],
    combatants: ids.map((id) => ({
      entity: state.entities.get(id),
      sheet: state.characterSheets.get(id),
      statBlock: state.statBlocks.get(id),
    })),
  };
}

async function probe(phase: Phase, injured: boolean, [spellId, targetId]: Probe) {
  const world = await arrange(phase, injured);
  const before = await world.state();
  const result = await world.submit(cast(ELOWEN, spellId, targetId === null ? {} : { targetId }));
  const after = await world.state();
  if (phase === 'a fight with an open window') {
    expect(result.status === 'rejected' && result.code).not.toBe('REACTION_PENDING');
    expect(windowDependencies(after)).toEqual(windowDependencies(before));
  }
  if (result.status === 'rejected') expect(after.version).toBe(before.version);
  await verifyHistory(world);
  expect((await world.store.loadStream(CAMPAIGN))?.version).toBe(after.version);
  return seen(result);
}

describe('G03-H06 outsider_healing_does_not_reveal_hidden_reaction_window', () => {
  const cases = [false, true].flatMap((injured) =>
    PROBES.map((probeCase) => [injured ? 'injured' : 'unhurt', probeCase, injured] as const),
  );

  it.each(cases)('%s: %j looks the same whether or not a window is open', async (_, p, injured) => {
    const [none, fight, window] = await Promise.all(
      PHASES.map((phase) => probe(phase, injured, p)),
    );
    expect(window).toEqual(fight);
    const targetsCombatant = p[1] === SHAMAN;
    if (targetsCombatant) {
      expect(none).toMatchObject({ status: 'accepted' });
      expect(fight).toEqual({
        status: 'rejected',
        code: 'ILLEGAL_ACTION',
        message: 'TARGET_IN_COMBAT',
      });
    } else {
      expect(fight).toEqual(none);
    }
  });
});
