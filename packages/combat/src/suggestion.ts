import type { MonsterTurnSuggestion, Side, Square } from '@ltw/contracts';
import {
  currentCombatant,
  pausedCombat,
  type CombatantRecord,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import { onGround, pathCostFt, squareDistanceFt } from '@ltw/rules';

import { inBounds, isAlive, isDifficult, occupant } from './battlefield.ts';
import { attackPlan } from './legality.ts';
import { movePlan } from './movement.ts';
import { monsterSpellPlan } from './spell-legality.ts';
import { incapacitated, speedOf, vitalsOf, has } from './vitals.ts';

/**
 * A suggested action for a creature's turn (docs/adr/0020-npc-intelligence.md
 * §5, owner decision), by a fixed tactic:
 * 1. a stat-block spell on the nearest hostile it may legally target;
 * 2. otherwise an attack on the nearest hostile it may legally attack;
 * 3. otherwise a move toward the nearest hostile;
 * 4. otherwise ending the turn.
 * Legality comes only from the functions the decisions use (`monsterSpellPlan`,
 * `attackPlan`, `movePlan`) and the kernel's pause rule (`pausedCombat`). Pure and deterministic: ties go to turn order,
 * then to the lower row and column. No AI, and nothing acts by itself: the
 * DM reads it and submits it, or anything else, as a command.
 */
const ENEMIES: Readonly<Record<Side, readonly Side[]>> = {
  hostile: ['party'],
  party: ['hostile'],
  neutral: [],
};

/** The movement command allows at most this many squares. */
const MAX_PATH = 40;

export function suggestMonsterTurn(state: WorldState): MonsterTurnSuggestion | null {
  const suggestion = chooseTurn(state);
  // While a reaction window is open the encounter waits (ADR 0016 §1): the
  // kernel's own pause rule refuses the command, so none is suggested (G04-M01).
  return suggestion && pausedCombat(state, suggestion.command) === null ? suggestion : null;
}

function chooseTurn(state: WorldState): MonsterTurnSuggestion | null {
  const encounter = state.encounter;
  const current = encounter ? currentCombatant(encounter) : undefined;
  if (!encounter || !current) return null;
  const vitals = vitalsOf(state, current.entityId);
  if (vitals?.kind !== 'creature') return null;
  const self = current.entityId;
  const name = (id: string) => state.entities.get(id)?.name ?? id;
  const endTurn = (why: string): MonsterTurnSuggestion => ({
    combatantId: self,
    tactic: 'end-turn',
    command: { type: 'EndTurn', combatantId: self },
    explanation: `${name(self)} ends its turn: ${why}.`,
  });
  if (!isAlive(state, self) || incapacitated(vitals)) return endTurn('it cannot act');

  // A creature a party character commands (ADR 0044 §7) fights the party's foes.
  const side = (current.commandedBy ?? null) === null ? current.side : 'party';
  const hostiles = encounter.combatants
    .filter(
      (c) => c.entityId !== self && ENEMIES[side].includes(c.side) && isAlive(state, c.entityId),
    )
    .map((record) => ({ record, distanceFt: squareDistanceFt(current.position, record.position) }))
    .sort((a, b) => a.distanceFt - b.distanceFt);
  const [nearest] = hostiles;
  if (!nearest) return endTurn('no hostile is left standing');

  for (const { record, distanceFt } of hostiles) {
    for (const spell of vitals.block.spells) {
      if (!monsterSpellPlan(state, encounter, self, spell.spellId, record.entityId).legal) continue;
      return {
        combatantId: self,
        tactic: 'spell',
        command: {
          type: 'CastSpell',
          combatantId: self,
          spellId: spell.spellId,
          targetId: record.entityId,
        },
        explanation: `${name(self)} casts ${spell.name} at ${name(record.entityId)}, the nearest hostile it may target (${String(distanceFt)} ft).`,
      };
    }
  }
  for (const { record, distanceFt } of hostiles) {
    for (const attack of vitals.block.attacks) {
      if (!attackPlan(state, encounter, self, attack.attackId, record.entityId).legal) continue;
      return {
        combatantId: self,
        tactic: 'attack',
        command: {
          type: 'Attack',
          combatantId: self,
          attackId: attack.attackId,
          targetId: record.entityId,
        },
        explanation: `${name(self)} attacks ${name(record.entityId)} with its ${attack.name}, the nearest hostile it may attack (${String(distanceFt)} ft).`,
      };
    }
  }
  const path = approach(state, encounter, current, nearest.record);
  if (path) {
    return {
      combatantId: self,
      tactic: 'move',
      command: { type: 'MoveCombatant', combatantId: self, path },
      explanation: `${name(self)} moves toward ${name(nearest.record.entityId)}, the nearest hostile (${String(nearest.distanceFt)} ft away).`,
    };
  }
  return endTurn('nothing it may do reaches a hostile');
}

/**
 * The cheapest path, within the movement left, to the reachable square
 * nearest the target; null when no square gets closer. Checked with the
 * decision's own `movePlan` before it is suggested.
 */
function approach(
  state: WorldState,
  encounter: EncounterState,
  mover: CombatantRecord,
  target: CombatantRecord,
): Square[] | null {
  const vitals = vitalsOf(state, mover.entityId);
  if (!vitals) return null;
  const speed = speedOf(vitals);
  const standUp = has(vitals, 'prone') ? Math.floor(speed / 10) * 5 : 0;
  const budget = speed + (mover.turn.dashFt ?? 0) - standUp - mover.turn.movementUsedFt;
  const key = (square: Square) => `${String(square.x)},${String(square.y)}`;
  const start = mover.position;
  const best = new Map<string, { cost: number; path: Square[] }>([
    [key(start), { cost: 0, path: [] }],
  ]);
  const queue: { square: Square; cost: number; path: Square[] }[] = [
    { square: start, cost: 0, path: [] },
  ];
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost || a.square.y - b.square.y || a.square.x - b.square.x);
    const next = queue.shift();
    if (!next || next.path.length >= MAX_PATH) continue;
    for (const dy of [-1, 0, 1]) {
      for (const dx of [-1, 0, 1]) {
        const square = { x: next.square.x + dx, y: next.square.y + dy };
        if ((dx === 0 && dy === 0) || square.x < 0 || square.y < 0) continue;
        if (!inBounds(encounter, square) || occupant(state, encounter, square, mover.entityId))
          continue;
        const step = pathCostFt([onGround(next.square), onGround(square)], (p) =>
          isDifficult(encounter, p),
        );
        if (!step.valid) continue;
        const cost = next.cost + step.costFt;
        const seen = best.get(key(square));
        if (cost > budget || (seen && seen.cost <= cost)) continue;
        const path = [...next.path, square];
        best.set(key(square), { cost, path });
        queue.push({ square, cost, path });
      }
    }
  }
  const from = squareDistanceFt(start, target.position);
  const choice = [...best.values()]
    .filter(({ path }) => path.length > 0)
    .map((entry) => ({
      ...entry,
      distance: squareDistanceFt(entry.path.at(-1) ?? start, target.position),
    }))
    .filter(({ distance }) => distance < from)
    .sort((a, b) => {
      const [ea, eb] = [a.path.at(-1) ?? start, b.path.at(-1) ?? start];
      return a.distance - b.distance || a.cost - b.cost || ea.y - eb.y || ea.x - eb.x;
    })[0];
  if (!choice) return null;
  return movePlan(state, encounter, mover, choice.path).legal ? choice.path : null;
}
