import type {
  ReactionAttackOption,
  ReactionCandidateView,
  ReactionChoice,
  ReactionWindowView,
} from '@ltw/contracts';
import {
  candidateReactions,
  combatantOf,
  openReactionWindow,
  triggerActor,
  type ReactionWindowRecord,
  type WorldState,
} from '@ltw/domain';

import { vitalsOf } from '../vitals.ts';
import { meleeAttacks } from './opportunity.ts';

/**
 * The open reaction window as a viewer may see it
 * (docs/adr/0016-reaction-engine.md §4; docs/adr/0046-reactions-beyond-counterspell.md §1). Built
 * field by field. The DM sees the whole window. A candidate's player sees who set it off (named
 * only when known), their own answer and their choices — for a spell, never the spell, its target
 * or the other candidates; for an attack, what a table hears: the total, their own AC, the damage
 * a hit would do. The player of the window's actor sees only that it waits. Anyone else sees none.
 */
export interface WindowViewer {
  readonly dm: boolean;
  /** The viewing character, if any. */
  readonly holder: string | null;
  readonly known: ReadonlySet<string>;
}

type Candidate = ReactionWindowRecord['candidates'][number];
type TriggerView = ReactionWindowView['trigger'];

export function reactionWindowView(
  state: WorldState,
  viewer: WindowViewer,
): ReactionWindowView | null {
  const window = openReactionWindow(state);
  if (!window) return null;
  const { trigger } = window;
  const actorOf = (entityId: string) => {
    const entity = state.entities.get(entityId);
    if (!entity) throw new Error(`reaction window participant ${entityId} is missing`);
    return {
      entityId: entity.entityId,
      kind: entity.kind,
      name: viewer.dm || viewer.known.has(entity.entityId) ? entity.name : null,
    };
  };
  const actorId = triggerActor(trigger);

  /** The trigger for this viewer: `full` for the DM, `asked` for a candidate, else the actor's. */
  const shown = (seen: 'full' | 'asked' | 'actor'): TriggerView => {
    switch (trigger.kind) {
      case 'spell':
        return {
          kind: 'spell',
          caster: actorOf(trigger.casterId),
          components: [...trigger.components],
          ...(seen === 'full'
            ? {
                spellId: trigger.spellId,
                targetId: trigger.targetId,
                point: trigger.point ? { x: trigger.point.x, y: trigger.point.y } : null,
              }
            : seen === 'actor'
              ? { spellId: trigger.spellId }
              : {}),
        };
      case 'move':
        return {
          kind: 'move',
          mover: actorOf(trigger.moverId),
          at: { x: trigger.at.x, y: trigger.at.y },
        };
      case 'attack': {
        // Its AC is the target's to know; the damage, once rolled, the target's and the DM's.
        const targetSees = seen === 'full' || (seen === 'asked' && trigger.phase === 'hit');
        return {
          kind: 'attack',
          attacker: actorOf(trigger.attackerId),
          target: actorOf(trigger.targetId),
          phase: trigger.phase,
          total: trigger.total,
          armorClass: targetSees ? trigger.spec.armorClass : null,
          critical: trigger.critical,
          damage: targetSees ? (trigger.damage?.amount ?? null) : null,
        };
      }
      case 'damage': {
        const struck =
          trigger.damaged.find((entry) => entry.entityId === viewer.holder) ?? trigger.damaged[0];
        return {
          kind: 'damage',
          source: actorOf(trigger.sourceId),
          target: actorOf(struck?.entityId ?? trigger.sourceId),
          amount: struck?.amount ?? 0,
        };
      }
    }
  };

  // What a pending candidate may answer, and with which attacks.
  const options = (candidate: Candidate): ReactionCandidateView => {
    const pending = candidate.response === 'pending';
    const choices: ReactionChoice[] = pending ? [...candidateReactions(candidate), 'ignore'] : [];
    const vitals = vitalsOf(state, candidate.entityId);
    const attacks: ReactionAttackOption[] =
      pending && vitals && choices.includes('opportunity-attack')
        ? meleeAttacks(state, vitals).map(({ attackId, name }) => ({ attackId, name }))
        : [];
    return {
      entityId: candidate.entityId,
      response: candidate.response,
      ...(pending ? { choices } : {}),
      ...(attacks.length > 0 ? { attacks } : {}),
    };
  };

  if (viewer.dm) {
    return {
      windowId: window.windowId,
      trigger: shown('full'),
      candidates: window.candidates.map(options),
      choices: [],
    };
  }
  // Their own character, and a creature it commands (docs/adr/0044-online-play.md §7).
  const encounter = state.encounter;
  const theirs = window.candidates.filter(
    (c) =>
      c.entityId === viewer.holder ||
      (viewer.holder !== null &&
        encounter !== null &&
        combatantOf(encounter, c.entityId)?.commandedBy === viewer.holder),
  );
  if (theirs.length === 0) {
    // The actor's player: it waits, and nothing of who may answer.
    if (viewer.holder === null || viewer.holder !== actorId) return null;
    return { windowId: window.windowId, trigger: shown('actor'), candidates: [], choices: [] };
  }
  const mine = theirs.find((c) => c.entityId === viewer.holder);
  const own = mine ? options(mine) : null;
  return {
    windowId: window.windowId,
    trigger: shown('asked'),
    candidates: theirs.map(options),
    choices: own?.choices ?? [],
    ...(own?.attacks ? { attacks: own.attacks } : {}),
  };
}
