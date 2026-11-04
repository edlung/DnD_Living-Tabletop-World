import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * Quests by hand (docs/adr/0058-campaign-content.md §2): the DM writes a quest — a title, what it is
 * about, its steps in order, each done or not — and says whether the party knows it. A known quest
 * shows in the party's journal beside the quests the campaign's quest book follows. Shapes only.
 */
export const MAX_QUEST_STEPS = 12;

const step = z.object({ text: z.string().trim().min(1).max(300), done: z.boolean() }).strict();

export const handQuestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().max(2000),
    steps: z.array(step).min(1).max(MAX_QUEST_STEPS),
    /** The party knows it: it shows in their journal. */
    known: z.boolean(),
  })
  .strict();
export type HandQuest = z.infer<typeof handQuestSchema>;

/** A quest written, rewritten, or taken away (null). */
export const setQuestCommandSchema = z
  .object({
    type: z.literal('SetQuest'),
    questId: entityIdSchema,
    quest: handQuestSchema.nullable(),
  })
  .strict();

/** A step marked done, or not. */
export const setQuestStepCommandSchema = z
  .object({
    type: z.literal('SetQuestStep'),
    questId: entityIdSchema,
    step: z
      .number()
      .int()
      .min(0)
      .max(MAX_QUEST_STEPS - 1),
    done: z.boolean(),
  })
  .strict();

/** A quest by hand as its viewer sees it: the DM every one, the others the known ones. */
export interface HandQuestView extends HandQuest {
  readonly questId: string;
  /** Every step done. */
  readonly completed: boolean;
}
