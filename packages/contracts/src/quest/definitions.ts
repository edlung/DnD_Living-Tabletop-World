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
  'shown-to',
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
  z
    .object({
      kind: z.literal('shown-to'),
      stage: slug,
      /** The NPC a party member shows the party's evidence to (Stage 530). */
      npcId: entityIdSchema,
      /** What the evidence is about. */
      subject: entityIdSchema,
      /** The stage after which showing it counts, if any. */
      after: slug.optional(),
      summary,
    })
    .strict(),
]);

/** The stage a milestone waits for, if any. */
export const milestoneAfter = (milestone: QuestMilestone): string | undefined =>
  milestone.kind === 'returned-to' || milestone.kind === 'shown-to' ? milestone.after : undefined;
export type QuestMilestone = z.infer<typeof questMilestoneSchema>;

export const questDefinitionSchema = z
  .object({
    questId: slug,
    title: z.string().trim().min(1).max(120),
    /** Active once the party first holds a record or memory of its own about this entity. */
    activation: z.object({ subject: entityIdSchema, summary }).strict(),
    milestones: z.array(questMilestoneSchema).max(20),
    /** The stage that completes the quest (Stage 530); without one the quest stays open. */
    completion: slug.optional(),
  })
  .strict()
  .refine((quest) => {
    const stages = new Set(quest.milestones.map((m) => m.stage));
    return (
      stages.size === quest.milestones.length &&
      quest.milestones.every((m) => {
        const after = milestoneAfter(m);
        return after === undefined || (after !== m.stage && stages.has(after));
      }) &&
      (quest.completion === undefined || stages.has(quest.completion))
    );
  }, 'stages must be unique, a stage waited for and the completing stage must be of the same quest');
export type QuestDefinition = z.infer<typeof questDefinitionSchema>;

export const questBookSchema = z
  .object({
    $comment: z.string().optional(),
    quests: z.array(questDefinitionSchema).max(50),
  })
  .strict();
