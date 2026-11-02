import { z } from 'zod';

import type { ReactionId } from '../combat/reactions.ts';
import { entityIdSchema, knowledgeIdSchema } from '../kernel/identifiers.ts';
import { ITEM_PLAYER_COMMAND_TYPES } from '../items/commands.ts';
import { knowledgeRelationSchema } from '../knowledge/commands.ts';
import type { WeaponMastery } from '../rules/character-sheet.ts';

/**
 * Investigation commands (docs/adr/0013-investigation.md). Player commands
 * name the acting character; the World Engine decides legality. Clues and
 * disclosure are DM data and never reach player views.
 */
export const EXAMINE_METHODS = ['inspect', 'investigation', 'perception'] as const;
export type ExamineMethod = (typeof EXAMINE_METHODS)[number];
/** Clue methods: the examinations, plus `magic`, revealed by Detect Magic (ADR 0015 §3). */
export const CLUE_METHODS = [...EXAMINE_METHODS, 'magic'] as const;
export type ClueMethod = (typeof CLUE_METHODS)[number];
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

/** Show an NPC an EVIDENCE record the asker holds (docs/adr/0020-npc-intelligence.md §1). */
export const showEvidenceCommandSchema = z
  .object({
    type: z.literal('ShowEvidence'),
    characterId: entityIdSchema,
    npcId: entityIdSchema,
    knowledgeId: knowledgeIdSchema,
  })
  .strict();

/** A Wisdom (Insight) check on an NPC about a known topic (docs/adr/0020-npc-intelligence.md §4). */
export const insightCheckCommandSchema = z
  .object({
    type: z.literal('InsightCheck'),
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
    method: z.enum(CLUE_METHODS),
    /** Required for checks, forbidden for `inspect` and `magic`. */
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
  'ShowEvidence',
  'InsightCheck',
  'ExamineEntity',
  'FormHypothesis',
  'MoveCombatant',
  'Attack',
  'CastSpell',
  'TakeAction',
  'MakeReadiedAttack',
  'SpendInspiration',
  'EndTurn',
  'UseReaction',
  'DeclineReaction',
  ...ITEM_PLAYER_COMMAND_TYPES,
] as const;
export type PlayerCommandType = (typeof PLAYER_COMMAND_TYPES)[number];

/** Player-visible outcome of an accepted player command (ADR 0013 §6). */
export type PlayerOutcome =
  | { readonly kind: 'EnterLocation'; readonly locationId: string }
  | { readonly kind: 'AskAbout'; readonly shared: readonly string[] }
  | { readonly kind: 'ShowEvidence'; readonly shown: string }
  | {
      readonly kind: 'InsightCheck';
      readonly roll: { readonly d20: number; readonly modifier: number; readonly total: number };
      /** The INFERENCE record gained, if any; a failure and nothing to sense look alike. */
      readonly inferred: readonly string[];
    }
  | {
      readonly kind: 'ExamineEntity';
      readonly roll: {
        readonly d20: number;
        readonly modifier: number;
        readonly total: number;
      } | null;
      readonly discovered: readonly string[];
    }
  | { readonly kind: 'FormHypothesis'; readonly knowledgeId: string }
  | {
      readonly kind: 'MoveCombatant';
      readonly position: { readonly x: number; readonly y: number };
      /** Feet above the ground where it stopped, flying (docs/adr/0049-space-and-movement.md §6). */
      readonly altitudeFt?: number;
      /** A long jump's landing in Difficult Terrain: its Dexterity (Acrobatics) check (§7). */
      readonly landing?: { readonly total: number; readonly success: boolean };
      /** A fall at its end (§8): the feet fallen and the damage taken. */
      readonly fell?: { readonly feet: number; readonly damage: number };
      /** The landing or the fall left it Prone. */
      readonly prone?: true;
      /** It falls, and a reaction may slow the fall before it lands (§8). */
      readonly falling?: true;
    }
  | {
      readonly kind: 'Attack';
      readonly d20: readonly number[];
      readonly attackTotal: number;
      readonly hit: boolean;
      readonly critical: boolean;
      readonly damage: number | null;
      /** Its window is open: a reroll or an answer to the hit waits (ADR 0046 §3). */
      readonly awaitingReaction?: true;
      /**
       * What the weapon's mastery did (docs/adr/0047-weapons.md §2): the feet Push moved it,
       * whether Topple knocked it Prone; Graze's damage on a miss is `damage`.
       */
      readonly mastery?: {
        readonly kind: WeaponMastery;
        readonly pushedFt?: number;
        readonly toppled?: boolean;
      };
      /** The target's defense changed the damage (docs/adr/0048-hit-points.md §3). */
      readonly defense?: 'resisted' | 'vulnerable' | 'immune';
      /** Knocked out instead of brought to 0 hit points (ADR 0048 §4). */
      readonly knockedOut?: true;
    }
  | {
      readonly kind: 'CastSpell';
      readonly spellId: string;
      readonly results: readonly {
        readonly targetId: string;
        readonly saved: boolean | null;
        readonly hit: boolean | null;
        readonly damage: number | null;
        readonly healed: number | null;
      }[];
      readonly discovered: readonly string[];
      /** The spell is suspended in a reaction window (docs/adr/0016-reaction-engine.md). */
      readonly awaitingReaction?: true;
    }
  /** An Unarmed Strike's grapple or shove (docs/adr/0047-weapons.md §3): whether it resisted. */
  | {
      readonly kind: 'UnarmedStrike';
      readonly effect: 'grapple' | 'shove';
      readonly saved: boolean;
      readonly shove?: 'push' | 'prone';
    }
  | { readonly kind: 'EndTurn'; readonly nextCombatantId: string; readonly round: number }
  | {
      readonly kind: 'UseReaction';
      readonly windowId: string;
      readonly reaction: ReactionId;
      /** True when the reaction stopped the spell. */
      readonly countered: boolean;
      /** An opportunity attack's or a reroll's roll and damage (docs/adr/0046-reactions-beyond-counterspell.md). */
      readonly attack?: {
        readonly attackTotal: number;
        readonly hit: boolean;
        readonly critical: boolean;
        readonly damage: number | null;
      };
      /** The damage the answer dealt (Hellish Rebuke) or the reactor took (Uncanny Dodge). */
      readonly damage?: number;
    }
  | {
      readonly kind: 'DeclineReaction';
      readonly windowId: string;
      /** What the window was about: a spell, a creature leaving reach, an attack, damage (ADR 0046). */
      readonly trigger: 'spell' | 'move' | 'attack' | 'damage' | 'fall';
    }
  | { readonly kind: 'Item'; readonly action: ItemAction; readonly itemId: string };

/** What an accepted item command did (docs/adr/0039-item-possession.md). */
export type ItemAction = 'equip' | 'unequip' | 'use' | 'give' | 'drop' | 'take';
