import type {
  Ability,
  HitDieSides,
  Skill,
  SpellcastingSource,
  WeaponId,
  AmmunitionKind,
  WeaponMastery,
} from './character-sheet.ts';

/**
 * Numbers that follow from a character sheet by the rules (SRD 5.2.1; `@ltw/rules` computes them on
 * the server, Stage 500). The client shows them and never recomputes a rule.
 */
export interface CharacterDerived {
  /** Total character level across classes. */
  readonly level: number;
  readonly proficiencyBonus: number;
  readonly abilities: Readonly<
    Record<
      Ability,
      {
        readonly score: number;
        readonly modifier: number;
        /** Saving throw bonus, proficiency included when the sheet has it. */
        readonly save: number;
        readonly saveProficient: boolean;
      }
    >
  >;
  readonly skills: Readonly<
    Record<
      Skill,
      {
        readonly ability: Ability;
        readonly total: number;
        readonly proficiency: 'none' | 'proficient' | 'expertise';
      }
    >
  >;
  readonly initiative: number;
  /** Speed after the character's conditions and Exhaustion (ADR 0045 §1, §3). */
  readonly speedFt: number;
  readonly passive: {
    readonly perception: number;
    readonly investigation: number;
    readonly insight: number;
  };
  readonly spellcasting: readonly {
    readonly source: SpellcastingSource['source'];
    readonly ability: Ability;
    readonly saveDc: number;
    readonly attackBonus: number;
  }[];
  /** Rule data of the spells the sheet lists (the words are the client dictionary's). */
  readonly spells: readonly {
    /** A slice spell or any SRD spell (docs/adr/0052-spells-as-data.md §1). */
    readonly spellId: string;
    /** The SRD's English name. */
    readonly name: string;
    readonly level: number;
    /** `long`: minutes or hours, outside a fight only. */
    readonly castingTime: 'action' | 'bonus' | 'reaction' | 'long';
    /** Feet, or 'self'. */
    readonly range: number | 'self';
    readonly components: readonly ('V' | 'S' | 'M')[];
    readonly concentration: boolean;
  }[];
  /** Weapon attacks the sheet can make: bonus to hit and damage (dice plus the ability modifier). */
  readonly attacks: readonly {
    readonly weaponId: WeaponId;
    readonly attackBonus: number;
    readonly damage: { readonly count: number; readonly sides: number; readonly bonus: number };
    readonly damageType: string;
    readonly ranged: boolean;
    readonly normalRangeFt: number;
    readonly longRangeFt: number;
    /** The mastery the character uses with it (docs/adr/0047-weapons.md §2); absent: none. */
    readonly mastery?: WeaponMastery;
    /** The pieces of its ammunition the character carries, when they are counted (§5). */
    readonly ammunition?: { readonly kind: AmmunitionKind; readonly count: number };
  }[];
  /** Strength × 15 lb; shown, never enforced (ADR 0039). */
  readonly carryingCapacityLb: number;
  /** Hit Point Dice by size, largest first: one per class level, spent in short rests. */
  readonly hitDice: readonly {
    readonly sides: HitDieSides;
    readonly total: number;
    readonly left: number;
  }[];
}
