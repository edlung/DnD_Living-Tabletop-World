import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { CONDITIONS } from '../rules/character-sheet.ts';

/**
 * Combat commands (docs/adr/0015-combat-engine.md). Schemas validate shape
 * only; legality is decided by the Rules Engine through the World Engine.
 */
export const COVER_LEVELS = ['half', 'three-quarters', 'total'] as const;
export type CoverLevel = (typeof COVER_LEVELS)[number];
export const SIDES = ['party', 'hostile', 'neutral'] as const;
export type Side = (typeof SIDES)[number];

export const MAX_BATTLEFIELD = 40;
/** Fights larger than the slice's 16 (docs/adr/0043-dm-screen.md §2). */
export const MAX_COMBATANTS = 40;

/** The SRD's damage types (SRD 5.2.1). */
export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export const squareSchema = z
  .object({
    x: z
      .number()
      .int()
      .min(0)
      .max(MAX_BATTLEFIELD - 1),
    y: z
      .number()
      .int()
      .min(0)
      .max(MAX_BATTLEFIELD - 1),
  })
  .strict();
export type Square = z.infer<typeof squareSchema>;

export const battlefieldSchema = z
  .object({
    width: z.number().int().min(1).max(MAX_BATTLEFIELD),
    height: z.number().int().min(1).max(MAX_BATTLEFIELD),
    difficult: z.array(squareSchema).max(400),
    cover: z
      .array(
        z
          .object({ x: squareSchema.shape.x, y: squareSchema.shape.y, level: z.enum(COVER_LEVELS) })
          .strict(),
      )
      .max(400),
  })
  .strict();
export type Battlefield = z.infer<typeof battlefieldSchema>;

export const startCombatCommandSchema = z
  .object({
    type: z.literal('StartCombat'),
    encounterId: entityIdSchema.optional(),
    locationId: entityIdSchema,
    battlefield: battlefieldSchema,
    combatants: z
      .array(
        z
          .object({ entityId: entityIdSchema, side: z.enum(SIDES), position: squareSchema })
          .strict(),
      )
      .min(2)
      .max(MAX_COMBATANTS),
  })
  .strict();

export const moveCombatantCommandSchema = z
  .object({
    type: z.literal('MoveCombatant'),
    combatantId: entityIdSchema,
    /** Squares entered, in order, starting next to the current square. */
    path: z.array(squareSchema).min(1).max(40),
  })
  .strict();

export const attackCommandSchema = z
  .object({
    type: z.literal('Attack'),
    combatantId: entityIdSchema,
    /** A character weapon (`longbow`) or a stat-block attack ID. */
    attackId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(48),
    targetId: entityIdSchema,
  })
  .strict();

export const castSpellCommandSchema = z
  .object({
    type: z.literal('CastSpell'),
    combatantId: entityIdSchema,
    /** A slice spell (ADR 0011) or a stat-block spell ID. */
    spellId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(48),
    /** Characters: a slot level or a slot-free cast; omitted = free first, then the lowest slot. */
    using: z
      .union([z.literal('free'), z.object({ slotLevel: z.number().int().min(1).max(9) }).strict()])
      .optional(),
    targetId: entityIdSchema.optional(),
    /** Fireball's point, or Misty Step's destination. */
    point: squareSchema.optional(),
  })
  .strict();

export const endTurnCommandSchema = z
  .object({ type: z.literal('EndTurn'), combatantId: entityIdSchema })
  .strict();

export const endCombatCommandSchema = z
  .object({ type: z.literal('EndCombat'), encounterId: entityIdSchema })
  .strict();

/**
 * The DM's hand (docs/adr/0043-dm-screen.md §1): what the table decides outside the rules engine's
 * own actions — damage or healing, a condition, Heroic Inspiration — through the World Engine, each
 * with the DM's reason. The reason is DM data, kept with the stored command for the DM's history.
 */
export const dmReasonSchema = z.string().trim().min(1).max(200);

export const adjustHitPointsCommandSchema = z
  .object({
    type: z.literal('AdjustHitPoints'),
    targetId: entityIdSchema,
    change: z.enum(['damage', 'healing']),
    amount: z.number().int().min(1).max(999),
    /** Damage only, and then required (the World Engine refuses otherwise). */
    damageType: z.enum(DAMAGE_TYPES).optional(),
    reason: dmReasonSchema,
  })
  .strict();

export const setConditionCommandSchema = z
  .object({
    type: z.literal('SetCondition'),
    targetId: entityIdSchema,
    condition: z.enum(CONDITIONS),
    applied: z.boolean(),
    reason: dmReasonSchema,
  })
  .strict();

export const setInspirationCommandSchema = z
  .object({
    type: z.literal('SetInspiration'),
    characterId: entityIdSchema,
    inspired: z.boolean(),
    reason: dmReasonSchema,
  })
  .strict();

/** The DM's hand commands, listed with their reasons in the DM's history. */
/**
 * A creature a player commands (docs/adr/0044-online-play.md §7): the DM hands a creature in the
 * fight — a summoned beast, a hireling, a companion — to a character of the party, whose player
 * then runs its turns; null takes it back.
 */
export const commandCreatureCommandSchema = z
  .object({
    type: z.literal('CommandCreature'),
    combatantId: entityIdSchema,
    characterId: entityIdSchema.nullable(),
  })
  .strict();

export const DM_HAND_COMMAND_TYPES = ['AdjustHitPoints', 'SetCondition', 'SetInspiration'] as const;
export type DmHandCommandType = (typeof DM_HAND_COMMAND_TYPES)[number];

/**
 * A running fight changed by the DM (docs/adr/0043-dm-screen.md §2): a creature joins (its
 * initiative rolled, or the total the DM names) or leaves, the current combatant delays its turn
 * until after another's this round, or a combatant's initiative is set. The current turn stays
 * where it is unless its combatant leaves or delays.
 */
const initiativeTotal = z.number().int().min(-10).max(60);

export const addCombatantCommandSchema = z
  .object({
    type: z.literal('AddCombatant'),
    entityId: entityIdSchema,
    side: z.enum(SIDES),
    position: squareSchema,
    /** A total the DM names (a physical roll); otherwise the World Engine rolls. */
    initiative: initiativeTotal.optional(),
  })
  .strict();

export const removeCombatantCommandSchema = z
  .object({ type: z.literal('RemoveCombatant'), entityId: entityIdSchema, reason: dmReasonSchema })
  .strict();

export const delayTurnCommandSchema = z
  .object({ type: z.literal('DelayTurn'), combatantId: entityIdSchema, afterId: entityIdSchema })
  .strict();

export const setInitiativeCommandSchema = z
  .object({ type: z.literal('SetInitiative'), combatantId: entityIdSchema, total: initiativeTotal })
  .strict();

export const FIGHT_CHANGE_COMMAND_TYPES = [
  'AddCombatant',
  'RemoveCombatant',
  'DelayTurn',
  'SetInitiative',
  'CommandCreature',
] as const;

/** Combat commands a player may issue for their own character. */
export const PLAYER_COMBAT_COMMAND_TYPES = [
  'MoveCombatant',
  'Attack',
  'CastSpell',
  'EndTurn',
  'UseReaction',
  'DeclineReaction',
] as const;
/** Every combat command decided by the combat engine (through the World Engine's port). */
export const COMBAT_COMMAND_TYPES = [
  'StartCombat',
  'MoveCombatant',
  'Attack',
  'CastSpell',
  'EndTurn',
  'EndCombat',
  'UseReaction',
  'DeclineReaction',
  'CloseReactionWindow',
  ...DM_HAND_COMMAND_TYPES,
  ...FIGHT_CHANGE_COMMAND_TYPES,
] as const;
export type CombatCommandType = (typeof COMBAT_COMMAND_TYPES)[number];
