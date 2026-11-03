import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { srdIdSchema } from '../srd/catalog.ts';
import { ABILITIES, CLASS_IDS, FIGHTING_STYLES, SKILL_IDS, WEAPON_IDS } from './character-sheet.ts';

/**
 * A level gained as the player's choices (docs/adr/0056-characters-from-the-srd.md §3): the class
 * it goes to — one the character has, or a new one whose prerequisites it meets — its hit points,
 * fixed or rolled by the World Engine, and what the level asks: an Ability Score Improvement or a
 * feat, new cantrips and spells, a Fighting Style, Expertise, invocations, Metamagic options, more
 * weapon masteries. The rules build the next sheet and refuse what does not hold.
 */
export const levelUpChoicesSchema = z
  .object({
    classId: z.enum(CLASS_IDS),
    hitPoints: z.enum(['fixed', 'rolled']),
    /** At an Ability Score Improvement level: +2 to one score or +1 to two, or a feat. */
    improvement: z
      .union([
        z
          .object({
            kind: z.literal('scores'),
            plus: z.array(z.enum(ABILITIES)).min(1).max(2),
          })
          .strict(),
        z
          .object({
            kind: z.literal('feat'),
            featId: srdIdSchema,
            /** The score the feat's Ability Score Increase raises, where it lets one choose. */
            ability: z.enum(ABILITIES).optional(),
          })
          .strict(),
      ])
      .optional(),
    cantrips: z.array(srdIdSchema).max(3),
    spells: z.array(srdIdSchema).max(6),
    /** A Wizard's new spellbook spells: six as a new class, else two. */
    spellbook: z.array(srdIdSchema).max(6),
    fightingStyle: z.enum(FIGHTING_STYLES).optional(),
    expertise: z.array(z.enum(SKILL_IDS)).max(2),
    invocations: z.array(srdIdSchema).max(3),
    metamagic: z.array(srdIdSchema).max(2),
    weaponMasteries: z.array(z.enum(WEAPON_IDS)).max(2),
    /** A new class's skill, where it gives one (a Bard's, a Ranger's, a Rogue's). */
    multiclassSkill: z.enum(SKILL_IDS).optional(),
  })
  .strict();
export type LevelUpChoices = z.infer<typeof levelUpChoicesSchema>;

/** The DM's experience for the characters present, divided evenly among them. */
export const awardExperienceRequestSchema = z
  .object({
    requestId: z.uuid(),
    amount: z.number().int().min(1).max(1_000_000),
    characterIds: z.array(entityIdSchema).min(1).max(12),
  })
  .strict();
export type AwardExperienceRequest = z.infer<typeof awardExperienceRequestSchema>;
