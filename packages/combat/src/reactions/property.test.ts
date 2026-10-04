import { REACTION_COMMAND_TYPES, type CommandResult } from '@ltw/contracts';
import {
  checkWorldIntegrity,
  combatantOf,
  currentCombatant,
  footprintOf,
  openReactionWindow,
  type Actor,
  type WorldState,
} from '@ltw/domain';
import { squareDistanceFt } from '@ltw/rules';
import { describe, expect, it } from 'vitest';

import {
  SEREN,
  SEREN_PLAYER,
  addSeren,
  cast,
  closeWindow,
  counterspell,
  ignore,
  withSeren,
} from '../testing/reactions.ts';
import {
  CAMPAIGN,
  DM,
  ELOWEN,
  PLAYER,
  RAIDER_1,
  RAIDER_2,
  RAIDER_3,
  SHAMAN,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from '../testing/road.ts';
import { forkWorld } from '../testing/fork.ts';
import { verifyHistory } from '../testing/verify.ts';
import { reactionWindowViolations } from './invariants.ts';

/**
 * Randomized reaction integrity (docs/adr/0016-reaction-engine.md): casts,
 * answers, closes, DM authoring (statuses, sheets, time, magic clues),
 * illegal commands, and undos of anything, in random order with random dice.
 * After every step the state is consistent, an open window is still legal,
 * a rejection changed nothing, and nothing but answers, closes, and undos
 * changed what an open window depends on. Every ten steps and at the end,
 * replay and re-decision agree (Gate 03).
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GOBLINS = [RAIDER_1, RAIDER_2, RAIDER_3, SHAMAN];
/** A character on the road outside the fight, and a bystander (Gate 03, G03-H04). */
const BRAM = 'bram-holloway';
const BRAM_PLAYER: Actor = { actorId: 'player-bram', kind: 'user' };
const WANDERER = 'wanderer';
const PLAYERS: Readonly<Record<string, Actor>> = {
  [ELOWEN]: PLAYER,
  [SEREN]: SEREN_PLAYER,
  [BRAM]: BRAM_PLAYER,
};
/** Exempt from the pause: a window's answers and close, and undo (with its own rule). */
const EXEMPT: ReadonlySet<string> = new Set([...REACTION_COMMAND_TYPES, 'UndoCommand']);

/**
 * The pause as an invariant (ADR 0016 §1), not a list of command types:
 * whatever else was accepted while a window was open changed nothing the
 * window depends on.
 */
async function expectPauseHeld(world: RoadWorld, before: WorldState, type: string) {
  const window = openReactionWindow(before);
  if (!window || EXEMPT.has(type)) return;
  const opened = footprintOf({ type: 'ReactionWindowOpened', payload: { window } });
  const depends = new Set([...opened.reads, ...opened.writes]);
  const fresh = (await world.store.loadStream(CAMPAIGN, before.version))?.events ?? [];
  for (const event of fresh) {
    for (const fact of footprintOf(event).writes) {
      expect(depends.has(fact), `${type} changed ${fact} during a window`).toBe(false);
    }
  }
}

/** Bram's world: on the road with Elowen's sheet but outside the fight, beside a bystander. */
async function addBystanders(world: RoadWorld): Promise<void> {
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  for (const command of [
    {
      type: 'CreateEntity',
      entityId: BRAM,
      kind: 'character',
      name: 'Bram Holloway',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    },
    { type: 'SetCharacterSheet', entityId: BRAM, sheet },
    { type: 'AssignCharacter', characterId: BRAM, playerActorId: BRAM_PLAYER.actorId },
    {
      type: 'CreateEntity',
      entityId: WANDERER,
      kind: 'npc',
      name: 'Wanderer',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    },
  ]) {
    const result = await world.dm(command);
    if (result.status === 'rejected') throw new Error(`bystander setup rejected: ${result.code}`);
  }
}

async function randomStep(
  world: RoadWorld,
  rng: () => number,
  mine: readonly string[],
): Promise<{ type: string; result: CommandResult; undid?: string }> {
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(rng() * items.length)];
    if (item === undefined) throw new Error('nothing to pick');
    return item;
  };
  const state = await world.state();
  const window = openReactionWindow(state);
  const current = state.encounter ? currentCombatant(state.encounter)?.entityId : undefined;
  const alive = (id: string) => state.entities.get(id)?.status === 'active';
  const options: { type: string; run: () => Promise<CommandResult> }[] = [];
  const as = (id: string) => PLAYERS[id] ?? DM;

  if (window) {
    for (const { entityId } of window.candidates) {
      options.push(
        {
          type: 'UseReaction',
          run: () => world.submit(counterspell(entityId, window.windowId), as(entityId)),
        },
        {
          type: 'DeclineReaction',
          run: () => world.submit(ignore(entityId, window.windowId), as(entityId)),
        },
      );
    }
    options.push({
      type: 'CloseReactionWindow',
      run: () => world.dm(closeWindow(window.windowId)),
    });
  }
  if (current) {
    options.push({
      type: 'EndTurn',
      run: () => world.submit({ type: 'EndTurn', combatantId: current }, as(current)),
    });
    if (current === SHAMAN) {
      const target = pick([ELOWEN, SEREN]);
      const spell = pick(['ashen-bolt', 'binding-hex']);
      options.push({
        type: 'CastSpell',
        run: () => world.dm(cast(SHAMAN, spell, { targetId: target })),
      });
    } else if (current === ELOWEN || current === SEREN) {
      const target = pick(GOBLINS.filter(alive).concat(SHAMAN));
      options.push(
        {
          type: 'Attack',
          run: () =>
            world.submit(
              { type: 'Attack', combatantId: current, attackId: 'longbow', targetId: target },
              as(current),
            ),
        },
        {
          type: 'CastSpell',
          run: () => world.submit(cast(current, 'hunters-mark', { targetId: target }), as(current)),
        },
        {
          type: 'CastSpell',
          run: () => world.submit(cast(current, 'detect-magic'), as(current)),
        },
      );
    } else {
      const target = pick([ELOWEN, SEREN]);
      options.push({
        type: 'Attack',
        run: () =>
          world.dm({
            type: 'Attack',
            combatantId: current,
            attackId: 'shortbow',
            targetId: target,
          }),
      });
    }
  }
  // DM authoring between and during turns (Gate 03): what a window or a result may depend on.
  const anyone = pick([...GOBLINS, ELOWEN, SEREN, WANDERER, BRAM]);
  const bystanders = [...state.entities.values()]
    .filter((e) => e.kind === 'npc' && e.entityId.startsWith('passer-'))
    .map((e) => e.entityId);
  const pc = pick([ELOWEN, SEREN]);
  const sheet = state.characterSheets.get(pc);
  const authoring: typeof options = [];
  authoring.push(
    {
      type: 'ChangeEntityStatus',
      run: () =>
        world.dm({
          type: 'ChangeEntityStatus',
          entityId: anyone,
          status: pick(['dead', 'active']),
        }),
    },
    { type: 'AdvanceWorldTime', run: () => world.dm({ type: 'AdvanceWorldTime', by: 60 }) },
    {
      type: 'AddClue',
      run: () =>
        world.dm({
          type: 'AddClue',
          entityId: anyone,
          method: 'magic',
          statement: `A faint aura (${String(Math.floor(rng() * 1e6))}).`,
          subjects: [],
        }),
    },
  );
  // Outside the fight (G03-H04): Bram casts at bystanders or goblins, comes and goes;
  // the DM brings, moves, kills, and revives bystanders beneath his spells. Casts aim
  // mostly at the newest bystander, so "author, cast, undo beneath" happens often.
  const newest = bystanders[bystanders.length - 1] ?? WANDERER;
  const target = rng() < 0.6 ? newest : pick([WANDERER, BRAM, ...bystanders, ...GOBLINS]);
  const outside: typeof options = [
    {
      type: 'CastSpell',
      run: () =>
        world.submit(
          cast(BRAM, pick(['hunters-mark', 'healing-word']), { targetId: target }),
          BRAM_PLAYER,
        ),
    },
    {
      type: 'EnterLocation',
      run: () =>
        world.submit(
          {
            type: 'EnterLocation',
            characterId: BRAM,
            locationId: pick(['old-trade-road', 'north-gate']),
          },
          BRAM_PLAYER,
        ),
    },
    {
      type: 'CreateEntity',
      run: () =>
        world.dm({
          type: 'CreateEntity',
          entityId: `passer-${String(Math.floor(rng() * 1e6))}`,
          kind: 'npc',
          name: 'Passer-by',
          existsSince: null,
          placement: { locationId: 'old-trade-road', since: null },
        }),
    },
    {
      type: 'PlaceEntity',
      run: () =>
        world.dm({
          type: 'PlaceEntity',
          entityId: rng() < 0.6 ? newest : pick([WANDERER, ...bystanders]),
          locationId: pick(['old-trade-road', 'north-gate']),
        }),
    },
    {
      type: 'ChangeEntityStatus',
      run: () =>
        world.dm({
          type: 'ChangeEntityStatus',
          entityId: rng() < 0.6 ? newest : pick([WANDERER, BRAM, ...bystanders]),
          status: pick(['dead', 'active']),
        }),
    },
  ];
  const casting = outside[0];
  if (sheet) {
    authoring.push({
      type: 'SetCharacterSheet',
      run: () =>
        world.dm({
          type: 'SetCharacterSheet',
          entityId: pc,
          sheet: {
            ...sheet,
            armorClass: 10 + Math.floor(rng() * 21),
            conditions: pick([[], ['prone'], ['incapacitated']]),
          },
        }),
    });
  }
  // Undo: the latest effective command (reverse order); often one just beneath later
  // commands, where an unsafe undo would strand a dependent (Gate 03); sometimes any.
  const latest = mine[mine.length - 1];
  if (latest !== undefined && rng() < 0.3) {
    const roll = rng();
    const recent = mine.slice(-4, -1);
    const target =
      roll < 0.45 ? latest : roll < 0.85 && recent.length > 0 ? pick(recent) : pick(mine);
    const result = await world.dm({ type: 'UndoCommand', targetCommandId: target });
    return { type: 'UndoCommand', result, undid: target };
  }
  const branch = rng();
  const chosen =
    branch < 0.15 && casting
      ? rng() < 0.5
        ? casting
        : pick(outside)
      : branch < 0.35 || options.length === 0
        ? pick(authoring)
        : pick(options);
  return { type: chosen.type, result: await chosen.run() };
}

/**
 * A rule, not a determinism check (Gate 03, G03-H03): every magic clue a
 * combatant senses belongs to a combatant within 30 ft of it.
 */
async function expectMagicWithinRange(world: RoadWorld, before: WorldState): Promise<void> {
  const encounter = before.encounter;
  if (!encounter) return;
  const fresh = (await world.store.loadStream(CAMPAIGN, before.version))?.events ?? [];
  for (const event of fresh) {
    if (event.type !== 'EvidenceExamined' || event.payload.method !== 'magic') continue;
    const caster = combatantOf(encounter, event.payload.characterId);
    if (!caster) continue;
    const target = combatantOf(encounter, event.payload.entityId);
    const distance = target ? squareDistanceFt(caster.position, target.position) : Infinity;
    expect(distance, `sensed ${event.payload.entityId}`).toBeLessThanOrEqual(30);
  }
}

/**
 * Systematic undo (Gate 03, G03-H01/H02): on a copy of the world, try undoing
 * each of the latest effective commands, including ones beneath later
 * commands. Whatever undo accepts must leave a history that replays, stays
 * consistent (an open window still legal), and re-decides identically.
 */
async function expectAcceptedUndosSafe(world: RoadWorld, mine: readonly string[]) {
  for (const target of mine.slice(-6)) {
    const copy = await forkWorld(world);
    const undone = await copy.dm({ type: 'UndoCommand', targetCommandId: target });
    if (undone.status === 'accepted') await verifyHistory(copy);
  }
}

describe('randomized reaction integrity', () => {
  it.each([1, 7, 42, 1337, 20261004, 90, 3, 11, 2026, 77, 5, 13])('seed %i', async (seed) => {
    const rng = mulberry32(seed);
    const world = await roadWorld({ entropy: { next: () => Math.floor(rng() * 2 ** 32) } });
    await addSeren(world);
    await addBystanders(world);
    await startAmbush(world, [17, 3, 2, 1, 15, 5], withSeren());
    // Magic on every goblin, near and far, so Detect Magic's range is always at stake.
    for (const goblin of GOBLINS) {
      await world.dm({
        type: 'AddClue',
        entityId: goblin,
        method: 'magic',
        statement: `${goblin} carries a charm.`,
        subjects: [],
      });
    }
    const mine: string[] = []; // effective commands of this test, oldest first
    let windows = 0;
    for (let step = 0; step < 70; step += 1) {
      const before = await world.state();
      const { type, result, undid } = await randomStep(world, rng, mine);
      const after = await world.state();
      if (result.status === 'rejected') {
        expect(after.version, `${type} rejected yet changed state`).toBe(before.version);
      } else {
        if (undid !== undefined) mine.splice(mine.indexOf(undid), 1);
        else mine.push(result.commandId);
      }
      await expectPauseHeld(world, before, type);
      await expectMagicWithinRange(world, before);
      expect(checkWorldIntegrity(after), `after ${type} at step ${String(step)}`).toEqual([]);
      expect(reactionWindowViolations(after), `after ${type} at step ${String(step)}`).toEqual([]);
      if (step % 10 === 9) await verifyHistory(world);
      if (step % 5 === 4) await expectAcceptedUndosSafe(world, mine);
      windows = Math.max(windows, after.reactionWindows.size);
    }
    expect(windows).toBeGreaterThan(0);
    await verifyHistory(world);
  });
});
