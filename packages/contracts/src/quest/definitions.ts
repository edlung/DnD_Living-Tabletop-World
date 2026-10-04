import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * Quest definitions (docs/adr/0025-ravenford-integration.md §2; owner
 * decisions of 2026-10-04). A quest is a projection of what the party knows,
 * remembers, and did, never world truth (invariant 15). A definition says
 * when the quest activates for the party and which milestones update it.
 * Every milestone kind reads only the party's own records, its members'
 * movements and examinations, and fights they took part in.
 */
export const QUEST_MILESTONE_KINDS = [
  'reached',
  'examined-at',
  'hypothesized',
  'contradiction-found',
  'told-by',
  'survived-fight-at',
  'returned-to',
] as const;
export type QuestMilestoneKind = (typeof QUEST_MILESTONE_KINDS)[number];

const slug = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const summary = z.string().trim().min(1).max(200);

export const questMilestoneSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('reached'), stage: slug, locationId: entityIdSchema, summary })
    .strict(),
  z
    .object({ kind: z.literal('examined-at'), stage: slug, locationId: entityIdSchema, summary })
    .strict(),
  z
    .object({ kind: z.literal('hypothesized'), stage: slug, subject: entityIdSchema, summary })
    .strict(),
  z
    .object({
      kind: z.literal('contradiction-found'),
      stage: slug,
      subject: entityIdSchema,
      summary,
    })
    .strict(),
  z
    .object({
      kind: z.literal('told-by'),
      stage: slug,
      informant: entityIdSchema,
      subject: entityIdSchema,
      summary,
    })
    .strict(),
  z
    .object({
      kind: z.literal('survived-fight-at'),
      stage: slug,
      locationId: entityIdSchema,
      summary,
    })
    .strict(),
  z
    .object({
      kind: z.literal('returned-to'),
      stage: slug,
      locationId: entityIdSchema,
      /** The stage after which arriving there counts as a return. */
      after: slug,
      summary,
    })
    .strict(),
]);
export type QuestMilestone = z.infer<typeof questMilestoneSchema>;

export const questDefinitionSchema = z
  .object({
    questId: slug,
    title: z.string().trim().min(1).max(120),
    /** Active once the party first holds a record or memory of its own about this entity. */
    activation: z.object({ subject: entityIdSchema, summary }).strict(),
    milestones: z.array(questMilestoneSchema).max(20),
  })
  .strict()
  .refine(
    (quest) =>
      new Set(quest.milestones.map((m) => m.stage)).size === quest.milestones.length &&
      quest.milestones.every(
        (m) =>
          m.kind !== 'returned-to' || quest.milestones.some((other) => other.stage === m.after),
      ),
    'stages must be unique, and a return must follow a stage of the same quest',
  );
export type QuestDefinition = z.infer<typeof questDefinitionSchema>;

export const questBookSchema = z
  .object({
    $comment: z.string().optional(),
    quests: z.array(questDefinitionSchema).max(50),
  })
  .strict();
