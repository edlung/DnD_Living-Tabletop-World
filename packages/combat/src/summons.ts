import {
  MAX_COMBATANTS,
  type KernelCommandType,
  type Square,
  type SummonChoice,
  type SummonedCreature,
} from '@ltw/contracts';
import {
  FRESH_TURN,
  combatantOf,
  currentCombatant,
  foldDrafts,
  type CombatantRecord,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import {
  MAX_SUMMONED,
  abilityModifier,
  gapFt,
  spellRules,
  squaresOf,
  summonedBodies,
  type CastPlan,
  type SummonedBody,
} from '@ltw/rules';

import { joinRefusal, placedOf } from './battlefield.ts';
import type { Refusal } from './legality.ts';
import { departureEvents } from './order.ts';

/**
 * Summoning spells in play (docs/adr/0056-characters-from-the-srd.md §5): Find Steed, Giant
 * Insect, Summon Dragon and Animate Objects call up creatures with the stat blocks their slot
 * scales (`@ltw/rules` `summonedBodies`). In a fight each appears in the free space nearest the
 * square the caster names, within the spell's range, an ally that shares the caster's initiative
 * and takes its turn right after the caster's, its player commanding it (ADR 0044 §7); outside a
 * fight it is at the caster's place, and a fight that starts later puts it after its caster.
 * A summoned creature goes — leaving the fight, never to be brought back — when it drops to
 * 0 Hit Points, its caster dies, its caster's Concentration on the spell ends, or the caster
 * calls up another with the same spell.
 */
export interface PlacedSummon extends SummonedBody {
  /** Its north-west square in the fight; none outside one. */
  readonly position: Square | null;
}

const refuse = (reason: Refusal['reason']): Refusal => ({ legal: false, reason });

/** A placeholder id for spaces not taken yet: no combatant has it. */
const NOBODY = 'summon-to-be';

/**
 * What the cast calls up and where, or why it cannot: the choice its creature takes, and in a
 * fight a free space for each within range of the caster, nearest the named square (the caster's
 * own when none is named).
 */
export function summonPlan(
  state: WorldState,
  caster: { readonly entityId: string; readonly record: CombatantRecord | null },
  spell: {
    readonly spellId: string;
    readonly creature: SummonedCreature;
    readonly rangeFt: number | null;
    readonly level: number;
  },
  cast: Pick<CastPlan, 'attackBonus' | 'saveDc' | 'source'>,
  abilities: Readonly<Record<CastPlan['source']['ability'], number>>,
  choice: SummonChoice | undefined,
  point: Square | null,
): readonly PlacedSummon[] | Refusal {
  const language = state.campaign?.language === 'ru' ? 'ru' : 'en';
  const bodies = summonedBodies(
    spell.creature,
    choice,
    {
      level: spell.level,
      attackBonus: cast.attackBonus,
      saveDc: cast.saveDc,
      modifier: abilityModifier(abilities[cast.source.ability]),
    },
    { by: caster.entityId, spellId: spell.spellId },
    language,
  );
  if (typeof bodies === 'string') return refuse(bodies);
  const encounter = state.encounter;
  if (!encounter || !caster.record) return bodies.map((body) => ({ ...body, position: null }));
  return placed(state, encounter, caster.record, bodies, point ?? caster.record.position, spell);
}

function placed(
  state: WorldState,
  encounter: EncounterState,
  caster: CombatantRecord,
  bodies: readonly SummonedBody[],
  near: Square,
  spell: { readonly rangeFt: number | null },
): readonly PlacedSummon[] | Refusal {
  if (encounter.combatants.length + bodies.length > MAX_COMBATANTS) return refuse('NO_ROOM');
  const from = placedOf(state, caster);
  const { width, height } = encounter.battlefield;
  const squares: Square[] = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) squares.push({ x, y });
  // Nearest the named square first, then row by row: the same space on every replay.
  const steps = (square: Square) =>
    Math.max(Math.abs(square.x - near.x), Math.abs(square.y - near.y));
  squares.sort((a, b) => steps(a) - steps(b) || a.y - b.y || a.x - b.x);
  const taken = new Set<string>();
  const key = (square: Square) => `${String(square.x)},${String(square.y)}`;
  const result: PlacedSummon[] = [];
  for (const body of bodies) {
    const size = body.block.size ?? 'medium';
    const spot = squares.find((position) => {
      const space = { position, size, squeezed: false };
      if (joinRefusal(state, encounter, space, NOBODY) !== null) return false;
      if (squaresOf(space).some((square) => taken.has(key(square)))) return false;
      return spell.rangeFt === null || gapFt(from, space) <= spell.rangeFt;
    });
    if (!spot) return refuse('NO_ROOM');
    for (const square of squaresOf({ position: spot, size })) taken.add(key(square));
    result.push({ ...body, position: { ...spot } });
  }
  return result;
}

/**
 * The records and turns of what a cast called up: each creature made, at the caster's place, with
 * its block; in a fight joined right after its caster (and any it commands already), sharing its
 * initiative, its player commanding it. `ids` are the command's resolved IDs.
 */
export function summonEvents(
  state: WorldState,
  casterId: string,
  summons: readonly PlacedSummon[],
  ids: readonly string[],
): DraftEvent[] {
  const where = state.entities.get(casterId)?.placement?.locationId ?? null;
  const encounter = state.encounter;
  const caster = encounter ? combatantOf(encounter, casterId) : undefined;
  const events: DraftEvent[] = [];
  let order = encounter ? [...encounter.combatants] : [];
  const current = encounter ? currentCombatant(encounter)?.entityId : undefined;
  summons.slice(0, MAX_SUMMONED).forEach((summon, index) => {
    const entityId = ids[index];
    if (entityId === undefined) throw new Error('a summon resolved without its record ID');
    events.push(
      {
        type: 'EntityCreated',
        payload: {
          entityId,
          kind: 'creature',
          name: summon.name,
          description: '',
          existsSince: state.clock,
          location: null,
        },
      },
      ...(where === null
        ? []
        : [
            {
              type: 'EntityPlaced' as const,
              payload: {
                entityId,
                locationId: where,
                since: state.clock,
                previousLocationId: null,
              },
            },
          ]),
      { type: 'StatBlockSet', payload: { entityId, statBlock: summon.block } },
    );
    if (!encounter || !caster || !summon.position) return;
    const record: CombatantRecord = {
      entityId,
      side: caster.side,
      position: { ...summon.position },
      initiative: { ...caster.initiative },
      turn: { ...FRESH_TURN },
      slowedBy: null,
      commandedBy: casterId,
    };
    order = afterItsCaster(order, casterId, record);
    events.push({
      type: 'CombatOrderChanged',
      payload: {
        change: 'joined',
        entityId,
        combatants: order,
        currentIndex: order.findIndex((one) => one.entityId === current),
      },
    });
  });
  return events;
}

/** The order with a creature right after its caster and those its caster commands already. */
function afterItsCaster(
  order: readonly CombatantRecord[],
  casterId: string,
  record: CombatantRecord,
): CombatantRecord[] {
  let at = order.findIndex((one) => one.entityId === casterId) + 1;
  while (at < order.length && order[at]?.commandedBy === casterId) at += 1;
  return [...order.slice(0, at), record, ...order.slice(at)];
}

/**
 * A fight's order as it starts (ADR 0056 §5): a summoned creature whose caster fights shares the
 * caster's initiative and acts right after it, the caster's player commanding it.
 */
export function withSummoners(
  state: WorldState,
  order: readonly CombatantRecord[],
): CombatantRecord[] {
  let next = [...order];
  for (const record of order) {
    const by = state.statBlocks.get(record.entityId)?.summoned?.by;
    const caster = next.find((one) => one.entityId === by);
    if (!caster || state.entities.get(caster.entityId)?.kind !== 'character') continue;
    const joined: CombatantRecord = {
      ...record,
      initiative: { ...caster.initiative },
      commandedBy: caster.entityId,
    };
    next = afterItsCaster(
      next.filter((one) => one.entityId !== record.entityId),
      caster.entityId,
      joined,
    );
  }
  return next;
}

/**
 * The summoned creature that must go now, or null (§5): one down or whose caster is dead, one
 * whose caster's Concentration on its spell ended, one the caster replaced with the same spell in
 * this command (`created`), and one gone already that still stands in the fight.
 */
function goingNow(
  state: WorldState,
  created: ReadonlySet<string>,
  handled: ReadonlySet<string>,
): string | null {
  for (const [entityId, block] of state.statBlocks) {
    const mark = block.summoned;
    if (!mark || created.has(entityId) || handled.has(entityId)) continue;
    const entity = state.entities.get(entityId);
    if (!entity) continue;
    const fighting = state.encounter ? combatantOf(state.encounter, entityId) : undefined;
    if (entity.status !== 'active') {
      if (fighting) return entityId;
      continue;
    }
    if (block.hitPoints.current === 0) return entityId;
    if (state.entities.get(mark.by)?.status !== 'active') return entityId;
    const concentration = spellRules(mark.spellId)?.mechanics?.concentration === true;
    if (
      concentration &&
      state.characterSheets.get(mark.by)?.concentration?.spellId !== mark.spellId
    )
      return entityId;
    const replaced = [...created].some((id) => {
      const other = state.statBlocks.get(id)?.summoned;
      return other?.by === mark.by && other.spellId === mark.spellId;
    });
    if (replaced) return entityId;
  }
  return null;
}

/**
 * After every fight command, the summoned creatures that go (§5): gone from the world, out of the
 * fight, a turn that was its own passing on. Nothing goes while a reaction window waits: its close
 * comes back here.
 */
export function summonsAfter(
  context: DecisionContext,
  commandType: KernelCommandType,
  decision: Decision,
  dice: Dice,
): Decision {
  if (!decision.ok) return decision;
  if (decision.events.some((event) => event.type === 'ReactionWindowOpened')) return decision;
  // The creatures this command made (a block set again, as damage does, is no new summon).
  const made = new Set(
    decision.events.flatMap((event) =>
      event.type === 'EntityCreated' ? [event.payload.entityId] : [],
    ),
  );
  const created = new Set(
    decision.events.flatMap((event) =>
      event.type === 'StatBlockSet' &&
      event.payload.statBlock.summoned &&
      made.has(event.payload.entityId)
        ? [event.payload.entityId]
        : [],
    ),
  );
  const any =
    created.size > 0 || [...context.state.statBlocks.values()].some((block) => block.summoned);
  if (!any) return decision;
  const events: DraftEvent[] = [...decision.events];
  const handled = new Set<string>();
  // Each creature at most twice: gone from the world, then out of the fight.
  for (let step = 0; step < 2 * (context.state.statBlocks.size + created.size) + 1; step += 1) {
    const state = foldDrafts(context, commandType, events);
    const going = goingNow(state, created, handled);
    if (going === null) break;
    const entity = state.entities.get(going);
    if (entity?.status === 'active') {
      events.push({
        type: 'EntityStatusChanged',
        payload: { entityId: going, from: 'active', to: 'dead' },
      });
      continue;
    }
    handled.add(going);
    const encounter = state.encounter;
    const leaving = encounter ? departureEvents(state, encounter, going, dice) : [];
    if (leaving) events.push(...leaving);
  }
  return events.length === decision.events.length ? decision : { ...decision, events };
}
