import type { EntityKind, ExamineMethod, Skill } from '@ltw/contracts';

import {
  accept,
  reject,
  type Decision,
  type DecisionContext,
  type ResolvedCommandOf,
} from '../kernel/decision.ts';
import type { KernelEvent } from '../kernel/events.ts';
import {
  acting,
  incapacitated,
  isIncapacitated,
  memoryEvent,
  notPresent,
  target,
} from './acting.ts';
import { attemptKey, scopedKey } from './records.ts';

/**
 * `ExamineEntity` (docs/adr/0013-investigation.md §2). Inspect needs no roll
 * and may be repeated; a check is d20 + the rules' skill modifier, once per
 * character, entity, and method. Failure and "nothing here" produce the same
 * events: the examination (and roll) is recorded, nothing is revealed.
 */
const INSPECTABLE: ReadonlySet<EntityKind> = new Set([
  'character',
  'npc',
  'creature',
  'item',
  'feature',
  'location',
]);
const CHECKABLE: ReadonlySet<EntityKind> = new Set(['item', 'feature']);
const SKILL_OF: Readonly<Record<Exclude<ExamineMethod, 'inspect'>, Skill>> = {
  investigation: 'investigation',
  perception: 'perception',
};

export function decideExamineEntity(
  context: DecisionContext,
  command: ResolvedCommandOf<'ExamineEntity'>,
): Decision {
  const { state } = context;
  const { characterId, entityId, method, resolution } = command;
  const actor = acting(state, characterId);
  if (!actor.ok) return actor;
  const check = method !== 'inspect' ? method : null;
  if (check && isIncapacitated(actor.value)) return incapacitated();
  const found = target(state, actor.value, entityId);
  if (!found.ok) return found;
  if (!actor.value.perceived.has(entityId)) return notPresent();
  const entity = found.value;
  if (!(check ? CHECKABLE : INSPECTABLE).has(entity.kind)) {
    return reject('NO_EFFECT', 'Nothing to examine that way');
  }

  let roll: { d20: number; modifier: number; total: number } | null = null;
  if (check) {
    const sheet = actor.value.sheet;
    if (!sheet) return reject('NO_CHARACTER_SHEET', 'The character has no sheet');
    if (state.investigation.attempts.has(attemptKey(characterId, entityId, check))) {
      return reject('ALREADY_ATTEMPTED', 'Already attempted');
    }
    if (!context.skillModifier || resolution.d20 === null) {
      throw new Error('ExamineEntity check resolved without a skill-check port');
    }
    const modifier = context.skillModifier(sheet, SKILL_OF[check]);
    roll = { d20: resolution.d20, modifier, total: resolution.d20 + modifier };
  }

  const { scopeKey, scope } = actor.value;
  const clues = [...state.investigation.clues.values()].filter(
    (clue) =>
      clue.entityId === entityId &&
      clue.method === method &&
      !state.investigation.revealed.has(scopedKey(scopeKey, clue.clueId)) &&
      (clue.dc === null || (roll !== null && roll.total >= clue.dc)),
  );
  const revealed = clues.map((clue, index) => {
    const knowledgeId = resolution.ids[index];
    if (knowledgeId === undefined) throw new Error('ExamineEntity ran out of resolved IDs');
    return { clue, knowledgeId };
  });

  const events: KernelEvent[] = [
    {
      type: 'EvidenceExamined',
      payload: {
        characterId,
        entityId,
        method,
        scope: scopeKey,
        roll,
        revealed: revealed.map(({ clue, knowledgeId }) => ({ clueId: clue.clueId, knowledgeId })),
      },
    },
    ...revealed.map(({ clue, knowledgeId }): KernelEvent => ({
      type: 'KnowledgeAssigned',
      payload: {
        knowledgeId,
        scope,
        knowledgeType: 'EVIDENCE',
        statement: clue.statement,
        subjects: [...new Set([entityId, ...clue.subjects])],
        attributedTo: null,
        relations: [],
        knownSince: state.clock,
      },
    })),
  ];
  const first = revealed[0];
  if (first) {
    const memoryId = resolution.ids[revealed.length];
    if (memoryId === undefined) throw new Error('ExamineEntity ran out of resolved IDs');
    events.push(
      memoryEvent(state, actor.value, {
        memoryId,
        memoryKind: 'DISCOVERY',
        summary: `${actor.value.character.name} examined ${entity.name}: ${first.clue.statement}`,
        participants: [characterId, entityId],
        relatedKnowledge: revealed.map(({ knowledgeId }) => knowledgeId),
      }),
    );
  }
  return accept(...events);
}
