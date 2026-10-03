import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { ABILITIES, CONDITIONS } from '../rules/character-sheet.ts';

/**
 * Stat blocks for non-character combatants (docs/adr/0015-combat-engine.md §5).
 * Static statistics plus current vitals; DM-authored with `SetStatBlock`,
 * changed during combat by the World Engine. Mechanics only, our own text.
 */
const slug = z
  .string()
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase slug');
const modifier = z.number().int().min(-10).max(20);

export const damageSchema = z
  .object({
    count: z.number().int().min(1).max(20),
    sides: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
    bonus: z.number().int().min(-10).max(30),
    type: slug,
  })
  .strict();
export type Damage = z.infer<typeof damageSchema>;

export const monsterAttackSchema = z
  .object({
    attackId: slug,
    name: z.string().trim().min(1).max(60),
    kind: z.enum(['melee', 'ranged']),
    bonus: modifier,
    reachFt: z.number().int().min(5).max(30).multipleOf(5).optional(),
    normalRangeFt: z.number().int().min(5).max(600).multipleOf(5).optional(),
    longRangeFt: z.number().int().min(5).max(1200).multipleOf(5).optional(),
    damage: damageSchema,
    /** Extra damage when the attack roll had Advantage (SRD goblins). */
    advantageDamage: damageSchema.optional(),
  })
  .strict()
  .refine(
    (a) =>
      a.kind === 'melee'
        ? a.reachFt !== undefined
        : a.normalRangeFt !== undefined &&
          a.longRangeFt !== undefined &&
          a.longRangeFt >= a.normalRangeFt,
    'melee needs reach; ranged needs normal ≤ long range',
  );
export type MonsterAttack = z.infer<typeof monsterAttackSchema>;

export const monsterSpellSchema = z
  .object({
    spellId: slug,
    name: z.string().trim().min(1).max(60),
    level: z.number().int().min(0).max(9),
    castingTime: z.enum(['action', 'bonus']),
    rangeFt: z.number().int().min(5).max(600).multipleOf(5),
    components: z
      .array(z.enum(['V', 'S', 'M']))
      .min(1)
      .max(3),
    effect: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('attack'), bonus: modifier, damage: damageSchema }).strict(),
      z
        .object({
          kind: z.literal('save'),
          ability: z.enum(ABILITIES),
          dc: z.number().int().min(5).max(30),
          damage: damageSchema,
          halfOnSuccess: z.boolean(),
        })
        .strict(),
    ]),
  })
  .strict();
export type MonsterSpell = z.infer<typeof monsterSpellSchema>;

const score = z.number().int().min(1).max(30);

export const statBlockSchema = z
  .object({
    armorClass: z.number().int().min(1).max(40),
    hitPoints: z
      .object({ max: z.number().int().min(1).max(999), current: z.number().int().min(0).max(999) })
      .strict()
      .refine((hp) => hp.current <= hp.max, 'current HP exceeds maximum'),
    speedFt: z.number().int().min(0).max(200).multipleOf(5),
    abilities: z
      .object({ str: score, dex: score, con: score, int: score, wis: score, cha: score })
      .strict(),
    savingThrows: z
      .object({
        str: modifier,
        dex: modifier,
        con: modifier,
        int: modifier,
        wis: modifier,
        cha: modifier,
      })
      .strict(),
    initiativeBonus: modifier,
    /** Attacks per Attack action (Multiattack). */
    attacksPerAction: z.number().int().min(1).max(4),
    attacks: z.array(monsterAttackSchema).max(8),
    spells: z.array(monsterSpellSchema).max(8),
    conditions: z.array(z.enum(CONDITIONS)),
  })
  .strict();
export type StatBlock = z.infer<typeof statBlockSchema>;

export const setStatBlockCommandSchema = z
  .object({ type: z.literal('SetStatBlock'), entityId: entityIdSchema, statBlock: statBlockSchema })
  .strict();
