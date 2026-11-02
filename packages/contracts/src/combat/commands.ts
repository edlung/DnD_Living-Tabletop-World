import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import {
  ABILITIES,
  CONDITIONS,
  DAMAGE_TYPES,
  MAX_EXHAUSTION,
  SKILL_IDS,
  type DamageType,
  type Skill,
} from '../rules/character-sheet.ts';

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

/** The SRD's damage types, beside the sheet's other vocabularies (`rules/character-sheet.ts`). */
export { DAMAGE_TYPES, type DamageType };

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
    /** Squares no one stands in or crosses (docs/adr/0049-space-and-movement.md §4). */
    walls: z.array(squareSchema).max(800).optional(),
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
          .object({
            entityId: entityIdSchema,
            side: z.enum(SIDES),
            position: squareSchema,
            /** Surprised as the fight starts: Initiative with Disadvantage (ADR 0045 §5). */
            surprised: z.literal(true).optional(),
          })
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

/**
 * An attack beyond the Attack action's (docs/adr/0047-weapons.md §2, §4): the Light property's with
 * the other hand (a Bonus Action, or within the Action with Nick), and Cleave's second.
 */
export const ATTACK_EXTRAS = ['offhand', 'cleave'] as const;
export type AttackExtra = (typeof ATTACK_EXTRAS)[number];

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
    extra: z.enum(ATTACK_EXTRAS).optional(),
    /**
     * The mastery's choice on a hit, made before the roll (ADR 0047 §2): Push's feet (0: no push;
     * absent: 10) and Topple (absent: yes).
     */
    push: z.union([z.literal(0), z.literal(5), z.literal(10)]).optional(),
    topple: z.boolean().optional(),
    /**
     * An Unarmed Strike's effect (ADR 0047 §3): a grapple or a shove instead of its damage, and the
     * shove's choice — 5 ft away or knocked Prone (absent: away).
     */
    unarmed: z.enum(['grapple', 'shove']).optional(),
    shove: z.enum(['push', 'prone']).optional(),
    /** A melee attack that would bring it to 0 leaves it at 1, Unconscious (ADR 0048 §4). */
    knockOut: z.boolean().optional(),
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

/**
 * The actions of SRD 5.2.1 beside Attack and Magic (docs/adr/0045-conditions-and-actions.md §5).
 * Each spends the Action: Dash adds the Speed once more, Disengage keeps opportunity attacks off,
 * Dodge worsens attacks against the creature until its next turn, Help gives an ally's next attack
 * on a foe within 5 ft Advantage, Hide is a Stealth check from cover, Influence, Search and Study
 * are checks the DM reads, Utilize uses an object, Ready holds an attack for a trigger.
 */
export const COMBAT_ACTIONS = [
  'dash',
  'disengage',
  'dodge',
  'help',
  'hide',
  'influence',
  'ready',
  'search',
  'study',
  'utilize',
  /** A grapple's (docs/adr/0047-weapons.md §3): breaking free with the action, letting go freely. */
  'escape',
  'release',
  /** A DC 10 Medicine check: the dying stable, the knocked out awake (ADR 0048 §4). */
  'first-aid',
] as const;
export type CombatAction = (typeof COMBAT_ACTIONS)[number];

/** The skills of the actions that are checks (SRD 5.2.1): a player picks one. */
export const ACTION_SKILLS: Readonly<Partial<Record<CombatAction, readonly Skill[]>>> = {
  search: ['perception', 'insight', 'medicine', 'survival'],
  study: ['arcana', 'history', 'investigation', 'nature', 'religion'],
  influence: ['persuasion', 'deception', 'intimidation', 'performance', 'animal-handling'],
  escape: ['athletics', 'acrobatics'],
  'first-aid': ['medicine'],
};

export const takeActionCommandSchema = z
  .object({
    type: z.literal('TakeAction'),
    combatantId: entityIdSchema,
    action: z.enum(COMBAT_ACTIONS),
    /** Help: the foe within 5 ft. Ready: the creature the held attack waits for. */
    targetId: entityIdSchema.optional(),
    /** Influence, Search, Study: the skill of the check (one of the action's own). */
    skill: z.enum(SKILL_IDS).optional(),
    /** Ready: the attack held, and the trigger in the player's words. */
    readied: z
      .object({
        attackId: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(48),
        trigger: z.string().trim().min(1).max(120),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * The readied attack (docs/adr/0046-reactions-beyond-counterspell.md §5): its holder takes its
 * Reaction to make the attack it readied, when its player (or the DM) judges the trigger has come.
 */
export const makeReadiedAttackCommandSchema = z
  .object({ type: z.literal('MakeReadiedAttack'), combatantId: entityIdSchema })
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
    /**
     * Damage, healing, temporary hit points given, or the maximum lowered
     * (docs/adr/0048-hit-points.md §1–2).
     */
    change: z.enum(['damage', 'healing', 'temporary', 'reduce-maximum']),
    amount: z.number().int().min(1).max(999),
    /** Damage only, and then required (the World Engine refuses otherwise). */
    damageType: z.enum(DAMAGE_TYPES).optional(),
    reason: dmReasonSchema,
  })
  .strict();

/**
 * How a condition in a fight ends (docs/adr/0045-conditions-and-actions.md §2): at the start or the
 * end of a named combatant's turn, after that many of its turns; on a successful save at the end of
 * each of the affected creature's turns; or both. The source is the charmer, the one it fears, the
 * grappler.
 */
export const conditionDetailsSchema = z
  .object({
    sourceId: entityIdSchema.optional(),
    until: z
      .object({
        turnOf: entityIdSchema,
        at: z.enum(['start', 'end']),
        turns: z.number().int().min(1).max(100),
      })
      .strict()
      .optional(),
    save: z
      .object({ ability: z.enum(ABILITIES), dc: z.number().int().min(1).max(30) })
      .strict()
      .optional(),
    /** Invisible from the Hide action (§5): it ends when the creature attacks or casts a spell. */
    hidden: z.literal(true).optional(),
  })
  .strict();
export type ConditionDetails = z.infer<typeof conditionDetailsSchema>;

export const setConditionCommandSchema = z
  .object({
    type: z.literal('SetCondition'),
    targetId: entityIdSchema,
    condition: z.enum(CONDITIONS),
    applied: z.boolean(),
    /** Applying, in a fight: how it ends and its source (§2). */
    details: conditionDetailsSchema.optional(),
    reason: dmReasonSchema,
  })
  .strict();

/** Exhaustion's level set by the DM (§3): 0 lifts it; 6 kills. */
export const setExhaustionCommandSchema = z
  .object({
    type: z.literal('SetExhaustion'),
    targetId: entityIdSchema,
    level: z.number().int().min(0).max(MAX_EXHAUSTION),
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

/**
 * Heroic Inspiration spent by its holder's player: a table check rolled again
 * (docs/adr/0046-reactions-beyond-counterspell.md §6). Its reroll of an attack is an answer to
 * the attack's window instead.
 */
export const spendInspirationCommandSchema = z
  .object({ type: z.literal('SpendInspiration'), characterId: entityIdSchema })
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

export const DM_HAND_COMMAND_TYPES = [
  'AdjustHitPoints',
  'SetCondition',
  'SetExhaustion',
  'SetInspiration',
] as const;
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
  /** An object the party attacks (docs/adr/0048-hit-points.md §5; `combat/objects.ts`). */
  'AddObject',
] as const;

/** Combat commands a player may issue for their own character. */
export const PLAYER_COMBAT_COMMAND_TYPES = [
  'MoveCombatant',
  'Attack',
  'CastSpell',
  'TakeAction',
  'MakeReadiedAttack',
  'EndTurn',
  'UseReaction',
  'DeclineReaction',
  'SpendInspiration',
] as const;
/** Every combat command decided by the combat engine (through the World Engine's port). */
export const COMBAT_COMMAND_TYPES = [
  'StartCombat',
  'MoveCombatant',
  'Attack',
  'CastSpell',
  'TakeAction',
  'MakeReadiedAttack',
  'SpendInspiration',
  'EndTurn',
  'EndCombat',
  'UseReaction',
  'DeclineReaction',
  'CloseReactionWindow',
  ...DM_HAND_COMMAND_TYPES,
  ...FIGHT_CHANGE_COMMAND_TYPES,
] as const;
export type CombatCommandType = (typeof COMBAT_COMMAND_TYPES)[number];
