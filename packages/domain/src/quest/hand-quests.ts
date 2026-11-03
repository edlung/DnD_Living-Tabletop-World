import {
  entityIdSchema,
  handQuestSchema,
  type HandQuest,
  type HandQuestView,
} from '@ltw/contracts';
import { z } from 'zod';

import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { KernelEventOf, RecordedEvent, Restore } from '../kernel/events.ts';
import { facts } from '../kernel/fact-keys.ts';
import type { Footprint } from '../kernel/facts.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';

/**
 * Quests by hand (docs/adr/0058-campaign-content.md §2), a world fact beside the quest books: the
 * DM's quest — title, what it is about, steps done or not — and whether the party knows it. Written,
 * rewritten or taken away whole (`QuestSet`), a step marked (`QuestStepSet`); undone as any change.
 */
export const questSetPayloadSchema = z
  .object({ questId: entityIdSchema, quest: handQuestSchema.nullable() })
  .strict();
export const questStepSetPayloadSchema = z
  .object({
    questId: entityIdSchema,
    step: z.number().int().min(0),
    done: z.boolean(),
  })
  .strict();
export const questRestoreSchemas = [
  z
    .object({
      fact: z.literal('handQuest'),
      questId: entityIdSchema,
      value: handQuestSchema.nullable(),
    })
    .strict(),
] as const;

export const QUEST_EVENT_TYPES = ['QuestSet', 'QuestStepSet'] as const;
export type QuestEventType = (typeof QUEST_EVENT_TYPES)[number];

const same = (a: HandQuest | null, b: HandQuest | null) => JSON.stringify(a) === JSON.stringify(b);

export function decideSetQuest(
  state: WorldState,
  command: ResolvedCommandOf<'SetQuest'>,
): Decision {
  const before = state.handQuests.get(command.questId) ?? null;
  if (same(before, command.quest)) return reject('NO_EFFECT', 'The quest is already so');
  return accept({ type: 'QuestSet', payload: { questId: command.questId, quest: command.quest } });
}

export function decideSetQuestStep(
  state: WorldState,
  command: ResolvedCommandOf<'SetQuestStep'>,
): Decision {
  const quest = state.handQuests.get(command.questId);
  const step = quest?.steps[command.step];
  if (!quest || !step) return reject('NOT_PRESENT', 'No such quest or step');
  if (step.done === command.done) return reject('NO_EFFECT', 'The step is already so');
  const { questId, done } = command;
  return accept({ type: 'QuestStepSet', payload: { questId, step: command.step, done } });
}

export function applyQuestEvent(
  state: WorldState,
  event: Extract<RecordedEvent, { type: QuestEventType }>,
): WorldState {
  const { questId } = event.payload;
  if (event.type === 'QuestSet') return put(state, questId, event.payload.quest);
  const quest = state.handQuests.get(questId);
  const step = quest?.steps[event.payload.step];
  if (!quest || !step) throw new CorruptHistoryError(`no step ${String(event.payload.step)}`);
  const steps = quest.steps.map((one, index) =>
    index === event.payload.step ? { ...one, done: event.payload.done } : one,
  );
  return put(state, questId, { ...quest, steps });
}

const put = (state: WorldState, questId: string, quest: HandQuest | null): WorldState => ({
  ...state,
  handQuests:
    quest === null
      ? withoutEntry(state.handQuests, questId)
      : withEntry(state.handQuests, questId, quest),
});

export const applyQuestRestore = (
  state: WorldState,
  restore: Extract<Restore, { fact: 'handQuest' }>,
): WorldState => put(state, restore.questId, restore.value);

export const questRestores = (
  event: KernelEventOf<QuestEventType>,
  before: WorldState,
): Restore[] => [
  {
    fact: 'handQuest',
    questId: event.payload.questId,
    value: before.handQuests.get(event.payload.questId) ?? null,
  },
];

export const questFootprint = (event: KernelEventOf<QuestEventType>): Footprint => {
  const quest = facts.handQuest(event.payload.questId);
  return { reads: [facts.clock(), quest], writes: [quest] };
};

/** The quests by hand a perspective sees: the DM every one, anyone else the known ones. */
export function handQuestsView(
  state: WorldState,
  perspective: ResolvedPerspective,
): HandQuestView[] {
  return [...state.handQuests]
    .filter(([, quest]) => perspective.kind === 'DM' || quest.known)
    .map(([questId, quest]) => ({
      questId,
      ...quest,
      completed: quest.steps.every((one) => one.done),
    }));
}
