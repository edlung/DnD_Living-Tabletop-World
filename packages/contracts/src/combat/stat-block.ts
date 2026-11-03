import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { summonedSchema } from '../srd/summons.ts';
import {
  ABILITIES,
  CONDITIONS,
  CREATURE_SIZES,
  damageDefensesShape,
  effectiveMaximum,
  exhaustionSchema,
  hitPointsSchema,
  sensesSchema,
  speedsSchema,
} from '../rules/character-sheet.ts';

/** What an object is made of, and how big it is (SRD 5.2.1; ADR 0048 §5). */
export const OBJECT_MATERIALS = [
  'cloth',
  'glass',
  'wood',
  'stone',
  'iron',
  'mithral',
  'adamantine',
] as const;
export type ObjectMaterial = (typeof OBJECT_MATERIALS)[number];
export const OBJECT_SIZES = ['tiny', 'small', 'medium', 'large'] as const;
export type ObjectSize = (typeof OBJECT_SIZES)[number];

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
    /** None for a flat amount ("Hit: 1 Piercing damage"; docs/adr/0053-monsters-as-data.md §1). */
    count: z.number().int().min(0).max(20),
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
    /** The damage a hit adds, each of its own type ("plus 3 (1d6) Fire damage"; ADR 0053 §1). */
    extraDamage: z.array(damageSchema).min(1).max(2).optional(),
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

/**
 * An action with a save (docs/adr/0053-monsters-as-data.md §2): a breath in a cone or a line from
 * the creature, an area on a point in range, or one creature within its reach; one damage roll,
 * half or none on a success; recharged on a d6 or used so many times a day.
 */
export const monsterSaveActionSchema = z
  .object({
    actionId: slug,
    name: z.string().trim().min(1).max(60),
    ability: z.enum(ABILITIES),
    dc: z.number().int().min(1).max(30),
    area: z
      .object({
        shape: z.enum(['sphere', 'cube', 'cone', 'line', 'cylinder', 'emanation']),
        sizeFt: z.number().int().min(5).max(500),
        widthFt: z.number().int().min(5).max(60).nullable(),
        origin: z.enum(['self', 'point']),
      })
      .strict()
      .nullable(),
    reachFt: z.number().int().min(5).max(120).nullable(),
    rangeFt: z.number().int().min(5).max(1200).nullable(),
    /** An ancient dragon's breath rolls up to 26 dice. */
    damage: z
      .array(damageSchema.extend({ count: z.number().int().min(0).max(40) }))
      .min(1)
      .max(2),
    onSuccess: z.enum(['half', 'none']),
    recharge: z.number().int().min(2).max(6).nullable(),
    perDay: z.number().int().min(1).max(9).nullable(),
    /**
     * Part of its Multiattack, beside the attacks (a Draconic Spirit's Breath Weapon; docs/adr/
     * 0056-characters-from-the-srd.md §5): once a turn, before, between or after them.
     */
    inMultiattack: z.literal(true).optional(),
  })
  .strict();
export type MonsterSaveAction = z.infer<typeof monsterSaveActionSchema>;

const score = z.number().int().min(1).max(30);

export const statBlockSchema = z
  .object({
    armorClass: z.number().int().min(1).max(40),
    hitPoints: hitPointsSchema.refine(
      (hp) => hp.current <= effectiveMaximum(hp),
      'current HP exceeds maximum',
    ),
    ...damageDefensesShape,
    speedFt: z.number().int().min(0).max(200).multipleOf(5),
    /** Its size (docs/adr/0049-space-and-movement.md §1); absent: Medium. */
    size: z.enum(CREATURE_SIZES).optional(),
    /** Its speeds beside walking (ADR 0049 §5); absent: none. */
    speeds: speedsSchema.optional(),
    senses: sensesSchema.optional(),
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
    /** Its actions with a save (docs/adr/0053-monsters-as-data.md §2); absent: none. */
    saveActions: z.array(monsterSaveActionSchema).max(6).optional(),
    /** Its challenge rating and XP (ADR 0053 §3): the encounter's difficulty counts them. */
    challenge: z
      .object({
        rating: z.string().regex(/^(0|1\/8|1\/4|1\/2|[1-9]|[12]\d|30)$/),
        xp: z.number().int().min(0).max(200_000),
      })
      .strict()
      .optional(),
    /** The traits the engine plays (§4): Pack Tactics, Magic Resistance, Legendary Resistance. */
    traits: z
      .object({
        packTactics: z.literal(true).optional(),
        magicResistance: z.literal(true).optional(),
        /** Uses a day, the DM's to spend. */
        legendaryResistance: z.number().int().min(1).max(9).optional(),
      })
      .strict()
      .optional(),
    /** Legendary actions (§4): uses a round, and the attacks they make. */
    legendary: z
      .object({
        uses: z.number().int().min(1).max(5),
        attacks: z.array(slug).min(1).max(4),
      })
      .strict()
      .optional(),
    spells: z.array(monsterSpellSchema).max(8),
    conditions: z.array(z.enum(CONDITIONS)),
    /** The conditions it is immune to (docs/adr/0053-monsters-as-data.md §1); absent: none. */
    conditionImmunities: z.array(z.enum(CONDITIONS)).max(CONDITIONS.length).optional(),
    /** Exhaustion's level (docs/adr/0045-conditions-and-actions.md §3); absent: none. */
    exhaustion: exhaustionSchema.optional(),
    /** Knocked out (docs/adr/0048-hit-points.md §4): a captive, Unconscious at 1 hit point. */
    knockedOut: z.literal(true).optional(),
    /**
     * An object the party attacks (docs/adr/0048-hit-points.md §5): its material and size, which gave
     * its AC and hit points. It takes no turn, fails every save and takes no condition.
     */
    object: z
      .object({
        material: z.enum(OBJECT_MATERIALS),
        size: z.enum(OBJECT_SIZES),
        resilient: z.boolean(),
      })
      .strict()
      .optional(),
    /** A creature a spell summoned (docs/adr/0056-characters-from-the-srd.md §5): whose, and how. */
    summoned: summonedSchema.optional(),
  })
  .strict();
export type StatBlock = z.infer<typeof statBlockSchema>;

export const setStatBlockCommandSchema = z
  .object({ type: z.literal('SetStatBlock'), entityId: entityIdSchema, statBlock: statBlockSchema })
  .strict();
