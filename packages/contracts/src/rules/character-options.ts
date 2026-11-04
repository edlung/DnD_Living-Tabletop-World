import type { CampaignOptions } from '../campaign/options.ts';
import type { SrdLanguage } from './languages.ts';
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
  /** Its words' language: Russian once its translation exists. */
  readonly language: 'en' | 'ru';
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
  /** Every option its features choose among (invocations, Metamagic), with its prerequisite. */
  readonly allOptions: readonly {
    readonly optionId: string;
    readonly name: string;
    readonly prerequisite: string | null;
  }[];
  /** Its level 1 features' names. */
  readonly features: readonly string[];
}

export interface SpeciesOptions {
  readonly speciesId: string;
  readonly language: 'en' | 'ru';
  readonly name: string;
  readonly size: string;
  readonly choosesSize: boolean;
  readonly speedFt: number;
  /** A lineage, an ancestor or an ancestry to choose, by its value and its words; empty for none. */
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly skillChoice: { readonly count: number; readonly from: readonly Skill[] } | null;
  readonly originFeat: boolean;
  /** Its option gives spells, whose ability the player chooses. */
  readonly givesSpells: boolean;
  readonly traits: readonly string[];
}

export interface BackgroundOptions {
  readonly backgroundId: string;
  readonly language: 'en' | 'ru';
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
  /** The feats a level's improvement may take: General feats, and Epic Boons at level 19. */
  readonly levelFeats: readonly {
    readonly featId: string;
    readonly name: string;
    readonly category: 'General' | 'Epic Boon';
    readonly prerequisite: string | null;
  }[];
  /** Every spell of every list, by level. */
  readonly spells: readonly SpellOption[];
  readonly weapons: readonly { readonly weaponId: WeaponId; readonly name: string }[];
  /** Every language, in the campaign's language; the rare ones marked (SRD 5.2.1). */
  readonly languages: readonly {
    readonly languageId: SrdLanguage;
    readonly name: string;
    readonly rare: boolean;
  }[];
  /** The level a new character starts at, the campaign's (docs/adr/0056-…md §3). */
  readonly startingLevel: number;
}

/**
 * GET …/characters/copyable: the characters a player's login plays in its other campaigns, to bring
 * here as a sheet only (docs/FULL_GAME_PLAN.md decision 15).
 */
export interface CopyableCharactersResponse {
  readonly characters: readonly {
    readonly campaignId: string;
    readonly campaignName: string;
    readonly characterId: string;
    readonly name: string;
    readonly level: number;
    readonly classes: readonly { readonly classId: ClassId; readonly level: number }[];
  }[];
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

/** What a level in a class asks (docs/adr/0056-characters-from-the-srd.md §3). */
export interface LevelAsksView {
  readonly classId: ClassId;
  readonly classLevel: number;
  readonly newClass: boolean;
  readonly features: readonly string[];
  readonly subclass: string | null;
  readonly improvement: boolean;
  readonly epicBoon: boolean;
  readonly cantrips: number;
  readonly spells: number;
  readonly spellbook: number;
  readonly maxSpellLevel: number;
  readonly fightingStyle: boolean;
  readonly expertise: number;
  readonly invocations: number;
  readonly metamagic: number;
  readonly weaponMasteries: number;
  readonly multiclassSkill: readonly Skill[] | null;
  /** How many languages the level lets the player choose (SRD 5.2.1). */
  readonly languages: number;
}

/** GET …/characters/:id/level-options: whether a level may be taken, and what each class asks. */
export interface LevelOptionsResponse {
  /** The perspective it was read from: the client refuses another's (a scoped read). */
  readonly perspective: string;
  readonly ready: boolean;
  readonly level: number;
  readonly experience: number;
  /** The experience the next level needs. */
  readonly nextAt: number;
  readonly pendingLevels: number;
  /** The campaign's options for levels: whose hit points, and by experience or milestone. */
  readonly options: Pick<CampaignOptions, 'hitPointsAtLevel' | 'levelsBy'>;
  readonly classes: readonly (
    | { readonly classId: ClassId; readonly asks: LevelAsksView }
    | { readonly classId: ClassId; readonly refused: string }
  )[];
}

/** POST …/characters/:id/advance. */
export interface LevelUpResponse {
  readonly status: 'levelled' | 'duplicate' | 'refused';
  readonly problems: readonly ChoiceProblem[];
}
