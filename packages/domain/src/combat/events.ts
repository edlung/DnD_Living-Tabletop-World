import {
  ABILITIES,
  COMBAT_ACTIONS,
  CONDITIONS,
  MAX_COMBATANTS,
  SIDES,
  SKILL_IDS,
  WEAPON_IDS,
  WEAPON_MASTERIES,
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
    /** Shield's +5 AC until its next turn starts (docs/adr/0046-reactions-beyond-counterspell.md §3). */
    shielded: z.literal(true).optional(),
    /**
     * The weapons' rules this turn (docs/adr/0047-weapons.md): the Light weapon the Attack action
     * attacked with, which the other hand may follow; that extra attack made; a Cleave hit's second
     * attack on offer while nothing else happened since, and Cleave used; a Loading weapon fired
     * with the action.
     */
    lightWeapon: z.enum(WEAPON_IDS).optional(),
    offhandAttacked: z.literal(true).optional(),
    cleave: z
      .object({
        targetId: entityIdSchema,
        attackId: slug,
        movementUsedFt: z.number().int().min(0).max(1000),
        attacksRemaining: z.number().int().min(0).max(4),
      })
      .strict()
      .optional(),
    cleaved: z.literal(true).optional(),
    loadingFired: z.literal(true).optional(),
  })
  .strict();

export const combatantRecordSchema = z
  .object({
    entityId: entityIdSchema,
    side: z.enum(SIDES),
    position: squareSchema,
    initiative: z
      // Exhaustion lowers the modifier (ADR 0045 §3): it reaches below a Dexterity of 1's −5.
      .object({
        roll,
        modifier: z.number().int().min(-30).max(30),
        total: z.number().int(),
        /** Surprised as the fight started: rolled with Disadvantage (ADR 0045 §5). */
        surprised: z.literal(true).optional(),
      })
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
    /**
     * The masteries' marks (docs/adr/0047-weapons.md §2): Sap — the creature whose hit gives this one
     * Disadvantage on its next attack roll, until that creature's next turn starts; Vex — the target
     * this one has Advantage against, ending after `turnsLeft` more ends of its own turns.
     */
    sappedBy: entityIdSchema.optional(),
    vexing: z
      .object({ targetId: entityIdSchema, turnsLeft: z.number().int().min(1).max(2) })
      .strict()
      .optional(),
    /** Ammunition this one spent in the fight, by stack: half comes back as it ends (ADR 0047 §5). */
    ammunitionSpent: z
      .array(z.object({ itemId: entityIdSchema, spent: z.number().int().min(1).max(99) }).strict())
      .max(8)
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
      /**
       * Made with the Reaction: an opportunity attack or the readied attack
       * (docs/adr/0046-reactions-beyond-counterspell.md); absent: the Attack action.
       */
      by: z.enum(['opportunity', 'readied', 'offhand', 'cleave']).optional(),
      /** The d20 rolled again with Heroic Inspiration: this roll replaces the one before (ADR 0046 §3). */
      rerolled: z.literal(true).optional(),
      /** A Versatile weapon in two hands, or a weapon thrown (docs/adr/0047-weapons.md §1). */
      grip: z.literal('two-handed').optional(),
      thrown: z.literal(true).optional(),
    })
    .strict(),
  /**
   * A weapon's mastery at work (docs/adr/0047-weapons.md §2): Sap, Vex, Topple's attempt, Graze's
   * damage, and Push with the squares the target was pushed from and to.
   */
  WeaponMasteryApplied: z
    .object({
      attackerId: entityIdSchema,
      targetId: entityIdSchema,
      mastery: z.enum(WEAPON_MASTERIES),
      from: squareSchema.optional(),
      to: squareSchema.optional(),
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
      /** What it took, after its defenses (docs/adr/0048-hit-points.md §3). */
      amount: z.number().int().min(0),
      damageType: slug,
      rolls: z.array(z.number().int().min(1).max(12)).max(60),
      hpBefore: hp,
      hpAfter: hp,
      /** Its Resistance, Vulnerability or Immunity to the type changed it; what was dealt. */
      defense: z.enum(['resisted', 'vulnerable', 'immune']).optional(),
      dealt: z.number().int().min(0).optional(),
      /** Temporary hit points that took part of it (ADR 0048 §1). */
      absorbed: z.number().int().min(1).max(999).optional(),
      /** Knocked out instead of brought to 0 (ADR 0048 §4). */
      knockedOut: z.literal(true).optional(),
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
      change: z.enum(['damage', 'healing', 'temporary', 'reduce-maximum']),
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
      /**
       * `condition`: the save at the end of a turn that ends a condition (ADR 0045 §2); `topple`,
       * `grapple`, `shove`: against a weapon's Topple or an Unarmed Strike (ADR 0047 §2–3).
       */
      purpose: z.enum([
        'spell',
        'concentration',
        'counterspell',
        'condition',
        'topple',
        'grapple',
        'shove',
      ]),
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
