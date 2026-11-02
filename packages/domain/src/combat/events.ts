import {
  ABILITIES,
  COMBAT_ACTIONS,
  CONDITIONS,
  MAX_COMBATANTS,
  SIDES,
  SKILL_IDS,
  battlefieldSchema,
  conditionDetailsSchema,
  entityIdSchema,
  squareSchema,
  statBlockSchema,
} from '@ltw/contracts';
import { z } from 'zod';

/**
 * Combat event payloads and undo restores (docs/adr/0015-combat-engine.md).
 * State changes: CombatStarted, TurnStarted, CombatantUpdated, CombatEnded,
 * StatBlockSet (characters use CharacterSheetSet). The other events record
 * what happened, with every roll, for audit and Chronicle; they change no
 * state. All are DM data: players see only command outcomes and views.
 */
const roll = z.number().int().min(1).max(20);
const rolls = z.array(z.number().int().min(1).max(20)).max(40);
const slug = z.string().min(1).max(48);
const hp = z.number().int().min(0).max(999);

export const turnRecordSchema = z
  .object({
    actionUsed: z.boolean(),
    bonusActionUsed: z.boolean(),
    reactionAvailable: z.boolean(),
    movementUsedFt: z.number().int().min(0).max(1000),
    slotExpendedThisTurn: z.boolean(),
    attacksRemaining: z.number().int().min(0).max(4),
    /**
     * The actions of docs/adr/0045-conditions-and-actions.md §5, until the creature's next turn
     * starts: Dash's added movement, Disengage, Dodge, the foe its Help is against, the attack it
     * holds ready. Absent: none.
     */
    dashFt: z.number().int().min(0).max(400).optional(),
    disengaged: z.literal(true).optional(),
    dodging: z.literal(true).optional(),
    helping: entityIdSchema.optional(),
    readied: z
      .object({
        attackId: slug,
        targetId: entityIdSchema,
        trigger: z.string().min(1).max(120),
      })
      .strict()
      .optional(),
  })
  .strict();

export const combatantRecordSchema = z
  .object({
    entityId: entityIdSchema,
    side: z.enum(SIDES),
    position: squareSchema,
    initiative: z
      // Exhaustion lowers the modifier (ADR 0045 §3): it reaches below a Dexterity of 1's −5.
      .object({ roll, modifier: z.number().int().min(-30).max(30), total: z.number().int() })
      .strict(),
    turn: turnRecordSchema,
    slowedBy: entityIdSchema.nullable(),
    /** The party character whose player runs this creature (ADR 0044 §7); absent or null: none. */
    commandedBy: entityIdSchema.nullable().optional(),
    /**
     * How its conditions in this fight end and their sources (docs/adr/0045-conditions-and-actions.md
     * §2): one entry per condition that has any; `until.turns` counts down at the named point of the
     * named combatant's turns. Absent: none.
     */
    conditionDetails: z
      .array(conditionDetailsSchema.extend({ condition: z.enum(CONDITIONS) }).strict())
      .max(CONDITIONS.length)
      .optional(),
  })
  .strict();

export const encounterSchema = z
  .object({
    encounterId: entityIdSchema,
    locationId: entityIdSchema,
    round: z.number().int().min(0),
    currentIndex: z
      .number()
      .int()
      .min(-1)
      .max(MAX_COMBATANTS - 1),
    battlefield: battlefieldSchema,
    combatants: z.array(combatantRecordSchema).min(2).max(MAX_COMBATANTS),
  })
  .strict();

export const combatEventPayloadSchemas = {
  CombatStarted: encounterSchema,
  TurnStarted: z.object({ combatantId: entityIdSchema, round: z.number().int().min(1) }).strict(),
  CombatantUpdated: z.object({ combatant: combatantRecordSchema }).strict(),
  CombatEnded: z.object({ encounterId: entityIdSchema }).strict(),
  /**
   * The DM changed a running fight (docs/adr/0043-dm-screen.md §2): who joined, left, delayed or
   * had initiative set, and the whole order after it, with the current turn's place.
   */
  CombatOrderChanged: z
    .object({
      change: z.enum(['joined', 'left', 'delayed', 'initiative']),
      entityId: entityIdSchema,
      combatants: z.array(combatantRecordSchema).min(2).max(MAX_COMBATANTS),
      currentIndex: z
        .number()
        .int()
        .min(-1)
        .max(MAX_COMBATANTS - 1),
    })
    .strict(),
  StatBlockSet: z.object({ entityId: entityIdSchema, statBlock: statBlockSchema }).strict(),
  /** An action beside Attack and Magic (docs/adr/0045-conditions-and-actions.md §5), with its check. */
  ActionTaken: z
    .object({
      combatantId: entityIdSchema,
      action: z.enum(COMBAT_ACTIONS),
      targetId: entityIdSchema.optional(),
      check: z
        .object({
          skill: z.enum(SKILL_IDS),
          rolls,
          modifier: z.number().int(),
          total: z.number().int(),
          /** Hide against its DC 15: whether it hid. Absent for a check the DM reads. */
          success: z.boolean().optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  AttackPerformed: z
    .object({
      attackerId: entityIdSchema,
      targetId: entityIdSchema,
      attackId: slug,
      rolls,
      modifier: z.number().int(),
      total: z.number().int(),
      advantage: z.boolean(),
      disadvantage: z.boolean(),
      cover: z.enum(['none', 'half', 'three-quarters']),
      critical: z.boolean(),
      hit: z.boolean(),
    })
    .strict(),
  SpellCast: z
    .object({
      casterId: entityIdSchema,
      spellId: slug,
      slotLevel: z.number().int().min(1).max(9).nullable(),
      free: z.boolean(),
      targetId: entityIdSchema.nullable(),
      point: squareSchema.nullable(),
    })
    .strict(),
  DamageApplied: z
    .object({
      targetId: entityIdSchema,
      sourceId: entityIdSchema,
      amount: z.number().int().min(0),
      damageType: slug,
      rolls: z.array(z.number().int().min(1).max(12)).max(60),
      hpBefore: hp,
      hpAfter: hp,
    })
    .strict(),
  HealingApplied: z
    .object({
      targetId: entityIdSchema,
      sourceId: entityIdSchema,
      amount: z.number().int().min(0),
      rolls: z.array(z.number().int().min(1).max(12)).max(40),
      hpBefore: hp,
      hpAfter: hp,
    })
    .strict(),
  /** The DM's damage or healing by hand (docs/adr/0043-dm-screen.md §1); the reason is the command's. */
  HitPointsAdjusted: z
    .object({
      targetId: entityIdSchema,
      change: z.enum(['damage', 'healing']),
      amount: z.number().int().min(0),
      damageType: slug.optional(),
      hpBefore: hp,
      hpAfter: hp,
    })
    .strict(),
  SavingThrowRolled: z
    .object({
      creatureId: entityIdSchema,
      ability: z.enum(ABILITIES),
      dc: z.number().int().min(1).max(40),
      rolls,
      modifier: z.number().int(),
      total: z.number().int(),
      success: z.boolean(),
      /** `condition`: the save at the end of a turn that ends a condition (ADR 0045 §2). */
      purpose: z.enum(['spell', 'concentration', 'counterspell', 'condition']),
    })
    .strict(),
  ConditionApplied: z
    .object({
      targetId: entityIdSchema,
      condition: z.enum(CONDITIONS),
      applied: z.boolean(),
      cause: slug,
    })
    .strict(),
  DeathSaveRolled: z
    .object({
      characterId: entityIdSchema,
      roll,
      successes: z.number().int().min(0).max(3),
      failures: z.number().int().min(0).max(3),
      outcome: z.enum(['success', 'failure', 'stable', 'dead', 'revived']),
    })
    .strict(),
} as const;

export const combatRestoreSchemas = [
  z.object({ fact: z.literal('encounter'), value: encounterSchema.nullable() }).strict(),
  z
    .object({
      fact: z.literal('statblock'),
      entityId: entityIdSchema,
      value: statBlockSchema.nullable(),
    })
    .strict(),
] as const;
