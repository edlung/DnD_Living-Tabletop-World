import { z } from 'zod';

import { entityIdSchema, knowledgeIdSchema } from '../kernel/identifiers.ts';
import { knowledgeRelationSchema } from '../knowledge/commands.ts';

/**
 * Investigation commands (docs/adr/0013-investigation.md). Player commands
 * name the acting character; the World Engine decides legality. Clues and
 * disclosure are DM data and never reach player views.
 */
export const EXAMINE_METHODS = ['inspect', 'investigation', 'perception'] as const;
export type ExamineMethod = (typeof EXAMINE_METHODS)[number];
/** Methods resolved by a skill check (one attempt per character, entity, method). */
export const CHECK_METHODS: ReadonlySet<ExamineMethod> = new Set(['investigation', 'perception']);

export const DISCLOSURES = ['WILLING', 'GUARDED'] as const;
export type Disclosure = (typeof DISCLOSURES)[number];

/** Clue IDs share the world-object format and namespace. */
export const clueIdSchema = entityIdSchema;

const statement = z.string().trim().min(1).max(2000);
const subjects = z.array(entityIdSchema).max(16);

export const enterLocationCommandSchema = z
  .object({
    type: z.literal('EnterLocation'),
    characterId: entityIdSchema,
    locationId: entityIdSchema,
  })
  .strict();

export const askAboutCommandSchema = z
  .object({
    type: z.literal('AskAbout'),
    characterId: entityIdSchema,
    npcId: entityIdSchema,
    topicId: entityIdSchema,
  })
  .strict();

export const examineEntityCommandSchema = z
  .object({
    type: z.literal('ExamineEntity'),
    characterId: entityIdSchema,
    entityId: entityIdSchema,
    method: z.enum(EXAMINE_METHODS),
  })
  .strict();

export const formHypothesisCommandSchema = z
  .object({
    type: z.literal('FormHypothesis'),
    characterId: entityIdSchema,
    scope: z.enum(['PARTY', 'CHARACTER']),
    statement,
    subjects: subjects.optional(),
    relations: z.array(knowledgeRelationSchema).max(16).optional(),
  })
  .strict();

export const addClueCommandSchema = z
  .object({
    type: z.literal('AddClue'),
    clueId: clueIdSchema.optional(),
    entityId: entityIdSchema,
    method: z.enum(EXAMINE_METHODS),
    /** Required for checks, forbidden for `inspect`. */
    dc: z.number().int().min(5).max(30).optional(),
    /** The EVIDENCE statement revealed to the discoverer. */
    statement,
    subjects: subjects.optional(),
  })
  .strict();

export const setDisclosureCommandSchema = z
  .object({
    type: z.literal('SetDisclosure'),
    knowledgeId: knowledgeIdSchema,
    disclosure: z.enum(DISCLOSURES),
  })
  .strict();

/** Player commands: issued for the actor's own character (or by the DM/system). */
export const PLAYER_COMMAND_TYPES = [
  'EnterLocation',
  'AskAbout',
  'ExamineEntity',
  'FormHypothesis',
] as const;
export type PlayerCommandType = (typeof PLAYER_COMMAND_TYPES)[number];

/** Player-visible outcome of an accepted player command (ADR 0013 §6). */
export type PlayerOutcome =
  | { readonly kind: 'EnterLocation'; readonly locationId: string }
  | { readonly kind: 'AskAbout'; readonly shared: readonly string[] }
  | {
      readonly kind: 'ExamineEntity';
      readonly roll: {
        readonly d20: number;
        readonly modifier: number;
        readonly total: number;
      } | null;
      readonly discovered: readonly string[];
    }
  | { readonly kind: 'FormHypothesis'; readonly knowledgeId: string };
