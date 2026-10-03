import {
  ABILITIES,
  CONDITIONS,
  SIDES,
  battlefieldSchema,
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
  })
  .strict();

export const combatantRecordSchema = z
  .object({
    entityId: entityIdSchema,
    side: z.enum(SIDES),
    position: squareSchema,
    initiative: z
      .object({ roll, modifier: z.number().int().min(-10).max(30), total: z.number().int() })
      .strict(),
    turn: turnRecordSchema,
    slowedBy: entityIdSchema.nullable(),
  })
  .strict();

export const encounterSchema = z
  .object({
    encounterId: entityIdSchema,
    locationId: entityIdSchema,
    round: z.number().int().min(0),
    currentIndex: z.number().int().min(-1).max(15),
    battlefield: battlefieldSchema,
    combatants: z.array(combatantRecordSchema).min(2).max(16),
  })
  .strict();

export const combatEventPayloadSchemas = {
  CombatStarted: encounterSchema,
  TurnStarted: z.object({ combatantId: entityIdSchema, round: z.number().int().min(1) }).strict(),
  CombatantUpdated: z.object({ combatant: combatantRecordSchema }).strict(),
  CombatEnded: z.object({ encounterId: entityIdSchema }).strict(),
  StatBlockSet: z.object({ entityId: entityIdSchema, statBlock: statBlockSchema }).strict(),
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
  SavingThrowRolled: z
    .object({
      creatureId: entityIdSchema,
      ability: z.enum(ABILITIES),
      dc: z.number().int().min(1).max(40),
      rolls,
      modifier: z.number().int(),
      total: z.number().int(),
      success: z.boolean(),
      purpose: z.enum(['spell', 'concentration', 'counterspell']),
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
