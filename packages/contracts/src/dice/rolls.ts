import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { ABILITIES, SKILLS, type Ability, type Skill } from '../rules/character-sheet.ts';

/**
 * Dice at the table (Stage 510, docs/PRODUCT_COMPLETION_PLAN.md decisions 1–4). Every die a view
 * shows was rolled by the server: by the World Engine for rule outcomes, by the table-roll service
 * for free rolls and checks. The client only animates a die to land on its value.
 */
export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export type DieSides = (typeof DIE_SIDES)[number];
const dieSides = z.union([
  z.literal(4),
  z.literal(6),
  z.literal(8),
  z.literal(10),
  z.literal(12),
  z.literal(20),
  z.literal(100),
]);

export interface RolledDie {
  readonly sides: DieSides;
  readonly value: number;
  /** The lower (Advantage) or higher (Disadvantage) of two d20s: rolled, not counted. */
  readonly dropped?: true;
}

export type RollPurpose =
  | 'attack'
  | 'damage'
  | 'healing'
  | 'check'
  | 'save'
  | 'death-save'
  | 'initiative'
  | 'hit-die'
  | 'dice';

/** One throw: the dice of one purpose, their modifier and total, and what came of it. */
export interface RollGroup {
  readonly purpose: RollPurpose;
  readonly dice: readonly RolledDie[];
  readonly modifier: number;
  readonly total: number;
  /** A natural 20 on an attack roll. */
  readonly critical?: true;
  /** Hit or miss, success or failure, where the viewer may know it. */
  readonly result?: 'hit' | 'miss' | 'success' | 'failure';
  /**
   * Failed without a die counting: a condition fails the save outright (docs/adr/0045-conditions-
   * and-actions.md §1). A table roll keeps its die for the log; a world save records none.
   */
  readonly autoFail?: true;
}

/** What a roll was for, in tokens the client words (never free text, never a target's ID). */
export type RollSubject =
  | {
      readonly kind: 'attack';
      readonly attack: string;
      /**
       * Made with the Reaction (docs/adr/0046-reactions-beyond-counterspell.md), or an extra attack
       * (docs/adr/0047-weapons.md: the other hand's, Cleave's); absent: the Attack action.
       */
      readonly by?: 'opportunity' | 'readied' | 'offhand' | 'cleave' | 'legendary';
    }
  | { readonly kind: 'spell'; readonly spellId: string }
  | { readonly kind: 'skill'; readonly skill: Skill }
  | { readonly kind: 'ability'; readonly ability: Ability }
  | { readonly kind: 'save'; readonly ability: Ability }
  | { readonly kind: 'death-save' }
  | { readonly kind: 'initiative' }
  | { readonly kind: 'hit-die' }
  | { readonly kind: 'dice' };

export interface RollEntry {
  /** Stable across reads: `world:<sequence>` or `table:<id>`. */
  readonly rollId: string;
  /** Who rolled, as this perspective knows them; null is the DM. */
  readonly roller: { readonly entityId: string; readonly name: string | null } | null;
  readonly subject: RollSubject;
  readonly groups: readonly RollGroup[];
  /** A roll only the DM sees (the DM's hidden rolls, monsters' rolls, initiative). */
  readonly hidden: boolean;
  /** Its faces were read off a player's own dice (docs/adr/0044-online-play.md §4). */
  readonly entered?: true;
  /** The DM confirmed the entered faces are what the dice showed. */
  readonly confirmed?: true;
  /** Seen by the DM and one character only: a word between the DM and one player. */
  readonly private?: true;
  /**
   * Heroic Inspiration spent (docs/adr/0046-reactions-beyond-counterspell.md §6): this roll
   * replaces the one named; that one is `rerolled` and no longer counts.
   */
  readonly rerollOf?: string;
  readonly rerolled?: true;
  /** ISO time the roll was made (wall clock), for ordering and the log. */
  readonly at: string;
}

/** The latest rolls this perspective may see, oldest first (GET …/rolls). */
export interface RollFeedResponse {
  readonly perspective: string;
  readonly rolls: readonly RollEntry[];
  /**
   * The viewer's own latest check, which its character's Heroic Inspiration may roll again
   * (docs/adr/0046-reactions-beyond-counterspell.md §6): a roll ID of `rolls`, or absent.
   */
  readonly rerollable?: string;
}

/** Most entries a feed returns. */
export const ROLL_FEED_SIZE = 30;

const skillIds = Object.keys(SKILLS) as [Skill, ...Skill[]];

/** A check a table roll or a DM's request names. */
export const checkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('skill'), skill: z.enum(skillIds) }).strict(),
  z.object({ kind: z.literal('ability'), ability: z.enum(ABILITIES) }).strict(),
  z.object({ kind: z.literal('save'), ability: z.enum(ABILITIES) }).strict(),
]);
export type Check = z.infer<typeof checkSchema>;

export const ROLL_MODES = ['normal', 'advantage', 'disadvantage'] as const;
export type RollMode = (typeof ROLL_MODES)[number];

/**
 * The faces a player read off their own dice (docs/adr/0044-online-play.md §4), one per die in the
 * roll's order — two d20s for a check with Advantage or Disadvantage. The server checks them
 * against the dice and computes every total from them.
 */
export const enteredFacesSchema = z.array(z.number().int().min(1).max(100)).min(1).max(40);

/** POST …/rolls: a free roll or a check, by a character (a player) or the DM. */
export const tableRollRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('dice'),
      /** The acting character; absent for the DM rolling as the DM. */
      characterId: entityIdSchema.optional(),
      dice: z
        .array(z.object({ count: z.number().int().min(1).max(10), sides: dieSides }).strict())
        .min(1)
        .max(4),
      modifier: z.number().int().min(-30).max(30),
      /** The DM only: a roll the players do not see. */
      hidden: z.boolean().optional(),
      /** A player: a roll only the DM sees with them. */
      private: z.boolean().optional(),
      /** The DM only: a roll one character's player sees with the DM. */
      shownTo: entityIdSchema.optional(),
      faces: enteredFacesSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('check'),
      characterId: entityIdSchema,
      check: checkSchema,
      mode: z.enum(ROLL_MODES),
      /** Answers this open request of the DM's (its check and mode win). */
      requestId: z.uuid().optional(),
      /** A roll only the DM sees with this player (a private request's answer always is). */
      private: z.boolean().optional(),
      faces: enteredFacesSchema.max(2).optional(),
    })
    .strict(),
]);
export type TableRollRequest = z.infer<typeof tableRollRequestSchema>;

/**
 * POST …/rolls/:rollId/reroll: Heroic Inspiration spent on one's latest check (ADR 0046 §6), its
 * lower d20 rolled again by the app, or read off one's own die (ADR 0044 §4).
 */
export const tableRerollRequestSchema = z
  .object({ faces: enteredFacesSchema.max(1).optional() })
  .strict();
export type TableRerollRequest = z.infer<typeof tableRerollRequestSchema>;

/**
 * POST …/check-requests (DM): ask a character for a check, with an optional hidden DC — or ask
 * several at once (docs/adr/0043-dm-screen.md §1): one request each, sharing a group.
 */
const requestedCheck = {
  check: checkSchema,
  mode: z.enum(ROLL_MODES),
  dc: z.number().int().min(1).max(40).optional(),
  /** Its answer is seen by the DM and that player only, and the table's screen does not list it. */
  private: z.boolean().optional(),
};
export const MAX_GROUP_CHECK = 8;
export const checkRequestSchema = z.union([
  z.object({ characterId: entityIdSchema, ...requestedCheck }).strict(),
  z
    .object({
      characterIds: z.array(entityIdSchema).min(2).max(MAX_GROUP_CHECK),
      ...requestedCheck,
    })
    .strict(),
]);
export type CheckRequestInput = z.infer<typeof checkRequestSchema>;

export interface CheckRequestView {
  readonly requestId: string;
  /** The group of a check asked of several at once; null for one alone. */
  readonly groupId: string | null;
  readonly characterId: string;
  readonly check: Check;
  readonly mode: RollMode;
  /** The DM's only. */
  readonly dc?: number;
  /** Asked in private: the answer is the DM's and this player's only. */
  readonly private?: true;
  readonly status: 'open' | 'rolled' | 'cancelled';
  /** Once rolled: the roll's total, and against the DC (the DM's only). */
  readonly total?: number;
  readonly success?: boolean;
  readonly at: string;
}

/**
 * How a character's d20 rolls come out under its conditions (docs/adr/0045-conditions-and-actions.md
 * §1, §3): for each asked mode, the one an ability check and each saving throw take; the saves its
 * conditions fail outright; Exhaustion's penalty. The server computes them; the client looks them
 * up (how many of a player's own dice to read, what to tell them).
 */
export interface D20Modes {
  readonly checks: Readonly<Record<RollMode, RollMode>>;
  readonly saves: Readonly<Record<Ability, Readonly<Record<RollMode, RollMode>>>>;
  readonly autoFail: readonly Ability[];
  readonly penalty: number;
}

/** GET …/check-requests: open requests for the viewer's character; for the DM all recent ones. */
export interface CheckRequestsResponse {
  readonly perspective: string;
  readonly requests: readonly CheckRequestView[];
  /** The viewer's character's d20 rolls under its conditions; absent for the DM and the party. */
  readonly d20?: D20Modes;
}
