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
  type ReactionWindowRecord,
  type WorldState,
} from '@ltw/domain';

import { vitalsOf } from '../vitals.ts';
import { meleeAttacks } from './opportunity.ts';

/**
 * The open reaction window as a viewer may see it
 * (docs/adr/0016-reaction-engine.md §4; docs/adr/0046-reactions-beyond-counterspell.md §1). Built
 * field by field. The DM sees the whole window and answers for its creatures. A candidate's player
 * sees who set it off (named only when known), their own answer and their choices — for a spell,
 * never the spell, its target or the other candidates. The player of the caster, or of the
 * creature leaving reach, sees that it waits. Anyone else sees no window.
 */
export interface WindowViewer {
  readonly dm: boolean;
  /** The viewing character, if any. */
  readonly holder: string | null;
  readonly known: ReadonlySet<string>;
}

type Candidate = ReactionWindowRecord['candidates'][number];

export function reactionWindowView(
  state: WorldState,
  viewer: WindowViewer,
): ReactionWindowView | null {
  const window = openReactionWindow(state);
  if (!window) return null;
  const { trigger } = window;
  const actorId = trigger.kind === 'spell' ? trigger.casterId : trigger.moverId;
  const entity = state.entities.get(actorId);
  if (!entity) throw new Error(`reaction trigger actor ${actorId} is missing`);
  const actor = {
    entityId: entity.entityId,
    kind: entity.kind,
    name: viewer.dm || viewer.known.has(entity.entityId) ? entity.name : null,
  };
  const shown: ReactionWindowView['trigger'] =
    trigger.kind === 'spell'
      ? { kind: 'spell', caster: actor, components: [...trigger.components] }
      : { kind: 'move', mover: actor, at: { x: trigger.at.x, y: trigger.at.y } };

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
      trigger:
        trigger.kind === 'spell'
          ? {
              kind: 'spell',
              caster: actor,
              components: [...trigger.components],
              spellId: trigger.spellId,
              targetId: trigger.targetId,
              point: trigger.point ? { x: trigger.point.x, y: trigger.point.y } : null,
            }
          : shown,
      candidates: window.candidates.map(options),
      choices: [],
    };
  }
  if (viewer.holder !== null && viewer.holder === actorId) {
    return {
      windowId: window.windowId,
      trigger:
        trigger.kind === 'spell'
          ? {
              kind: 'spell',
              caster: actor,
              components: [...trigger.components],
              spellId: trigger.spellId,
            }
          : shown,
      candidates: [],
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
  if (theirs.length === 0) return null;
  const mine = theirs.find((c) => c.entityId === viewer.holder);
  const own = mine ? options(mine) : null;
  return {
    windowId: window.windowId,
    trigger: shown,
    candidates: theirs.map(options),
    choices: own?.choices ?? [],
    ...(own?.attacks ? { attacks: own.attacks } : {}),
  };
}
