import type { SrdPickKind } from '../srd/creation.ts';
import type { ChoiceProblem } from './character-choices.ts';
import type {
  Ability,
  CharacterSheet,
  ClassId,
  ClassOrder,
  FightingStyle,
  Skill,
  WeaponId,
} from './character-sheet.ts';

/**
 * What the character builder offers, in the campaign's language where it exists
 * (docs/adr/0056-characters-from-the-srd.md §2): the classes with what each asks at level 1, the
 * species, the backgrounds, the Origin feats, the spells a level 1 character may know and the
 * weapons for Weapon Mastery. GET …/character-options.
 */
export interface NamedItem {
  readonly catalogId: string;
  readonly name: string;
}

export interface OptionPick {
  readonly kind: SrdPickKind;
  readonly from: readonly NamedItem[];
}

export interface OptionEquipment {
  readonly label: 'A' | 'B' | 'C';
  readonly items: readonly (NamedItem & { readonly quantity: number })[];
  readonly picks: readonly OptionPick[];
  readonly gp: number;
}

export interface OptionTools {
  readonly fixed: readonly NamedItem[];
  readonly pick: (OptionPick & { readonly count: number }) | null;
}

export interface ClassOptions {
  readonly classId: ClassId;
  readonly name: string;
  readonly primaryAbility: string;
  readonly hitDie: number;
  readonly savingThrows: readonly Ability[];
  readonly skills: { readonly choose: number; readonly from: readonly Skill[] };
  readonly tools: OptionTools;
  readonly armor: string;
  readonly weapons: string;
  readonly equipment: readonly OptionEquipment[];
  /** Its spellcasting at level 1; null for a class without. */
  readonly casting: {
    readonly ability: Ability;
    readonly cantrips: number;
    readonly prepared: number;
    readonly slots: number;
  } | null;
  readonly orders: readonly ClassOrder[];
  readonly fightingStyle: boolean;
  readonly masteries: number;
  /** The invocations a level 1 Warlock may take. */
  readonly invocations: readonly { readonly optionId: string; readonly name: string }[];
  /** Its level 1 features' names. */
  readonly features: readonly string[];
}

export interface SpeciesOptions {
  readonly speciesId: string;
  readonly name: string;
  readonly size: string;
  readonly choosesSize: boolean;
  readonly speedFt: number;
  /** A lineage, an ancestor or an ancestry to choose; empty for none. */
  readonly options: readonly string[];
  readonly skillChoice: { readonly count: number; readonly from: readonly Skill[] } | null;
  readonly originFeat: boolean;
  /** Its option gives spells, whose ability the player chooses. */
  readonly givesSpells: boolean;
  readonly traits: readonly string[];
}

export interface BackgroundOptions {
  readonly backgroundId: string;
  readonly name: string;
  readonly abilityScores: readonly Ability[];
  readonly feat: string;
  readonly featId: string;
  readonly skills: readonly Skill[];
  readonly tools: OptionTools;
  readonly equipment: readonly OptionEquipment[];
}

export interface SpellOption {
  readonly spellId: string;
  readonly name: string;
  readonly level: number;
  readonly school: string;
  readonly classes: readonly string[];
}

export interface CharacterOptionsResponse {
  readonly language: 'en' | 'ru';
  readonly classes: readonly ClassOptions[];
  readonly species: readonly SpeciesOptions[];
  readonly backgrounds: readonly BackgroundOptions[];
  readonly originFeats: readonly {
    readonly featId: string;
    readonly name: string;
    readonly repeatable: boolean;
  }[];
  readonly fightingStyles: readonly { readonly featId: FightingStyle; readonly name: string }[];
  /** Cantrips and level 1 spells of every list. */
  readonly spells: readonly SpellOption[];
  readonly weapons: readonly { readonly weaponId: WeaponId; readonly name: string }[];
}

/** POST …/characters/preview: what the choices make, or what does not hold. */
export interface CharacterPreviewResponse {
  readonly problems: readonly ChoiceProblem[];
  /** The sheet the choices make (rolled scores show at creation); null while problems stand. */
  readonly sheet: CharacterSheet | null;
  readonly items: readonly (NamedItem & { readonly quantity: number })[];
}

/** POST …/characters: the character made. */
export interface CharacterCreatedResponse {
  readonly characterId: string;
}
