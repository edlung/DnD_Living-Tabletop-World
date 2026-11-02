import { CURATED, COMPLETE } from './spell-curated.ts';
import type { SrdSpellText } from './spells.ts';

/**
 * A spell's mechanics layer derived from its text (docs/adr/0052-spells-as-data.md §2–4): only
 * where the SRD's wording is regular; anything else is left to the DM (`{ kind: 'dm' }`) unless
 * `spell-curated.ts` says more. The shape is contracts' `srdSpellMechanicsSchema`.
 */
export interface Dice {
  readonly count: number;
  readonly sides: number;
  readonly bonus: number;
}
export interface Damage {
  readonly dice: Dice;
  readonly type: string;
}
export type Effect =
  | {
      readonly kind: 'attack';
      readonly attack: 'melee' | 'ranged';
      readonly damage: readonly Damage[];
    }
  | {
      readonly kind: 'save';
      readonly ability: string;
      readonly damage: readonly Damage[];
      readonly onSuccess: 'half' | 'none';
      readonly condition: string | null;
      readonly repeatSave: boolean;
    }
  | { readonly kind: 'heal'; readonly dice: Dice; readonly modifier: boolean }
  | { readonly kind: 'temp-hp'; readonly dice: Dice }
  | { readonly kind: 'auto'; readonly darts: number; readonly damage: Damage }
  | { readonly kind: 'dm' };

export interface Upcast {
  readonly dice: Dice | null;
  readonly damageType: string | null;
  readonly targets: number | null;
  readonly darts: number | null;
}

export interface Mechanics {
  readonly spellId: string;
  readonly castingTime: { readonly unit: string; readonly amount: number };
  readonly range: { readonly kind: string; readonly amount: number | null };
  readonly area: {
    readonly shape: string;
    readonly sizeFt: number;
    readonly widthFt: number | null;
    readonly origin: 'point' | 'self';
  } | null;
  readonly seen: boolean;
  readonly targets: number | null;
  readonly duration: { readonly unit: string; readonly amount: number | null };
  readonly concentration: boolean;
  readonly ritual: boolean;
  readonly effect: Effect;
  readonly upcast: Upcast | null;
  readonly cantrip: 'dice' | 'beams' | null;
  readonly slice: boolean;
  readonly complete: boolean;
}

const TYPE =
  '(Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder)';
const DICE = '(\\d+d\\d+(?: [+−-] \\d+)?)';
const ABILITY = '(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)';
const CONDITION =
  '(Blinded|Charmed|Deafened|Frightened|Grappled|Incapacitated|Invisible|Paralyzed|Petrified|Poisoned|Prone|Restrained|Stunned|Unconscious)';
const COUNTS: Readonly<Record<string, number>> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
};
const ABILITIES: Readonly<Record<string, string>> = {
  Strength: 'str',
  Dexterity: 'dex',
  Constitution: 'con',
  Intelligence: 'int',
  Wisdom: 'wis',
  Charisma: 'cha',
};

/** "2d4 + 4" → { count 2, sides 4, bonus 4 }. */
export function diceOf(text: string): Dice {
  const match = /^(\d+)d(\d+)(?: ([+−-]) (\d+))?$/.exec(text);
  if (!match) throw new Error(`unread dice ${text}`);
  const bonus = Number(match[4] ?? 0) * (match[3] === '+' || match[3] === undefined ? 1 : -1);
  return { count: Number(match[1]), sides: Number(match[2]), bonus };
}

const damageOf = (dice: string | undefined, type: string | undefined): Damage[] =>
  dice && type ? [{ dice: diceOf(dice), type: type.toLowerCase() }] : [];

export function castingTimeOf(text: string): Mechanics['castingTime'] {
  if (/^Action/.test(text)) return { unit: 'action', amount: 1 };
  if (/^Bonus Action/.test(text)) return { unit: 'bonus', amount: 1 };
  if (/^Reaction/.test(text)) return { unit: 'reaction', amount: 1 };
  const match = /^(\d+) (minute|hour)s?\b/.exec(text);
  if (!match) throw new Error(`unread casting time ${text}`);
  return { unit: match[2] ?? '', amount: Number(match[1]) };
}

export function rangeOf(text: string): Mechanics['range'] {
  const feet = /^(\d+) feet$/.exec(text);
  if (feet) return { kind: 'feet', amount: Number(feet[1]) };
  const miles = /^(\d+) miles?$/.exec(text);
  if (miles) return { kind: 'miles', amount: Number(miles[1]) };
  const kinds: Readonly<Record<string, string>> = {
    Self: 'self',
    Touch: 'touch',
    Sight: 'sight',
    Unlimited: 'unlimited',
    Special: 'special',
  };
  const kind = kinds[text];
  if (!kind) throw new Error(`unread range ${text}`);
  return { kind, amount: null };
}

export function durationOf(text: string): Mechanics['duration'] {
  if (text === 'Instantaneous') return { unit: 'instantaneous', amount: null };
  if (/^Until dispelled/.test(text)) return { unit: 'until-dispelled', amount: null };
  if (text === 'Special') return { unit: 'special', amount: null };
  const match = /^(?:Concentration,? up to |Up to )?(\d+) (round|minute|hour|day)s?$/.exec(text);
  if (!match) throw new Error(`unread duration ${text}`);
  return { unit: match[2] ?? '', amount: Number(match[1]) };
}

/** The area the description names, centered on a point in range or starting from the caster. */
export function areaOf(spell: SrdSpellText): Mechanics['area'] {
  const from = spell.range === 'Self' ? 'self' : 'point';
  const text = spell.description;
  const round = new RegExp(
    '(\\d+)-foot-radius(?:, \\d+-foot-(?:high|tall))? (Sphere|Cylinder)',
  ).exec(text);
  if (round)
    return {
      shape: (round[2] ?? '').toLowerCase(),
      sizeFt: Number(round[1]),
      widthFt: null,
      origin: from,
    };
  const square = /(\d+)-foot (Cube|Cone|Emanation)/.exec(text);
  if (square) {
    const shape = (square[2] ?? '').toLowerCase();
    // An emanation always starts from its creature.
    return {
      shape,
      sizeFt: Number(square[1]),
      widthFt: null,
      origin: shape === 'emanation' ? 'self' : from,
    };
  }
  const line =
    /(\d+)-foot-long, (\d+)-foot-wide Line/.exec(text) ??
    /Line of [^.]*?(\d+) feet long and (\d+) feet wide/.exec(text);
  if (line)
    return { shape: 'line', sizeFt: Number(line[1]), widthFt: Number(line[2]), origin: 'self' };
  const wideFirst = /(\d+)-foot-wide, (\d+)-foot-long\s+Line/.exec(text);
  if (wideFirst)
    return {
      shape: 'line',
      sizeFt: Number(wideFirst[2]),
      widthFt: Number(wideFirst[1]),
      origin: 'self',
    };
  return null;
}

/** "up to three creatures" → 3. */
export function targetCountOf(text: string): number | null {
  const match =
    /\b[Uu]p to (two|three|four|five|six|seven|eight|nine|ten|twelve) (?:willing )?(?:creatures|Humanoids|Beasts|targets)/.exec(
      text,
    );
  return match ? (COUNTS[match[1] ?? ''] ?? null) : null;
}

export function effectOf(spell: SrdSpellText): Effect {
  const text = spell.description.replace(/\n/g, ' ');
  const heal = new RegExp(
    `regains? (?:a number of )?Hit Points equal to ${DICE}( plus your spellcasting ability modifier)?`,
  ).exec(text);
  if (heal) return { kind: 'heal', dice: diceOf(heal[1] ?? ''), modifier: heal[2] !== undefined };
  const temporary = new RegExp(`^You gain ${DICE} Temporary Hit Points\\.`).exec(text);
  if (temporary) return { kind: 'temp-hp', dice: diceOf(temporary[1] ?? '') };
  const attack = /Make an? (ranged|melee) spell attack/.exec(text);
  if (attack) {
    const hit = new RegExp(
      `On a hit, (?:the target|it) takes ${DICE} ${TYPE} damage(?: and ${DICE} ${TYPE} damage)?`,
    ).exec(text);
    if (hit) {
      const damage = [...damageOf(hit[1], hit[2]), ...damageOf(hit[3], hit[4])];
      return { kind: 'attack', attack: attack[1] === 'melee' ? 'melee' : 'ranged', damage };
    }
    return { kind: 'dm' };
  }
  const save = new RegExp(
    `(?:makes?|must succeed on|must make|succeeds? on) an? ${ABILITY} saving throw`,
  ).exec(text);
  if (!save) return { kind: 'dm' };
  const ability = ABILITIES[save[1] ?? ''] ?? '';
  const twice = `${DICE} ${TYPE} damage(?: and ${DICE} ${TYPE} damage)?`;
  const failed =
    new RegExp(`(?:taking|takes?) ${twice},? on a failed save`).exec(text) ??
    new RegExp(`On a failed save, (?:a|the) (?:creature|target) takes ${twice}`).exec(text) ??
    new RegExp(`saving throw,? or take ${twice}`).exec(text);
  const halved =
    /half as much damage on a successful one|On a successful save, (?:(?:a|the) (?:creature|target)|it) takes half (?:as much|the initial) damage/.test(
      text,
    );
  const damage = failed
    ? [...damageOf(failed[1], failed[2]), ...damageOf(failed[3], failed[4])]
    : [];
  const condition = failureCondition(text);
  if (damage.length === 0 && condition === null) return { kind: 'dm' };
  return {
    kind: 'save',
    ability,
    damage,
    onSuccess: halved && damage.length > 0 ? 'half' : 'none',
    condition,
    repeatSave: /At the end of each of its turns, the target repeats the save/.test(text),
  };
}

/** The one condition a failed save brings, as its failure clause names it; a choice is the DM's. */
function failureCondition(text: string): string | null {
  const clause =
    /On a failed save,[^.]*\./.exec(text)?.[0] ?? /saving throw,? or [^.]*\./.exec(text)?.[0] ?? '';
  const named = [...clause.matchAll(new RegExp(`the ${CONDITION} condition`, 'g'))];
  if (named.length !== 1 || new RegExp(`${CONDITION} or ${CONDITION}`).test(clause)) return null;
  return (named[0]?.[1] ?? '').toLowerCase();
}

export function upcastOf(spell: SrdSpellText): Upcast | null {
  const text = spell.level > 0 ? spell.higherLevels : null;
  if (!text) return null;
  const damage = new RegExp(
    `The (?:(\\w+) )?damage (?:\\(both initial and later\\) )?increases by ${DICE} for each spell slot level above`,
  ).exec(text);
  const healing = new RegExp(
    `The healing increases by ${DICE} for each spell slot level above`,
  ).exec(text);
  const targets = /You can target one additional \w+ for each spell slot level above/.test(text);
  const typed =
    damage?.[1] && new RegExp(`^${TYPE}$`).test(damage[1]) ? damage[1].toLowerCase() : null;
  const dice = damage?.[2] ?? healing?.[1];
  if (!dice && !targets) return null;
  return {
    dice: dice ? diceOf(dice) : null,
    damageType: typed,
    targets: targets ? 1 : null,
    darts: null,
  };
}

export function cantripOf(spell: SrdSpellText): Mechanics['cantrip'] {
  if (spell.level !== 0 || !spell.higherLevels) return null;
  if (
    /^Cantrip Upgrade\. The damage increases by \d+d\d+ when you reach levels 5/.test(
      spell.higherLevels,
    )
  )
    return 'dice';
  if (/creates two beams at level 5/.test(spell.higherLevels)) return 'beams';
  return null;
}

/** The slice's spells, cast by their own engine code (ADR 0015, 0016, 0046). */
const SLICE = new Set([
  'hunters-mark',
  'detect-magic',
  'healing-word',
  'misty-step',
  'fireball',
  'counterspell',
  'shield',
  'hellish-rebuke',
  'feather-fall',
]);

export function deriveMechanics(spell: SrdSpellText): Mechanics {
  const effect = effectOf(spell);
  const area = areaOf(spell);
  const single = area === null && effect.kind !== 'dm' && effect.kind !== 'temp-hp';
  const derived: Mechanics = {
    spellId: spell.spellId,
    castingTime: castingTimeOf(spell.castingTime),
    range: rangeOf(spell.range),
    area,
    seen: /\byou can see\b/.test(spell.description),
    targets: targetCountOf(spell.description) ?? (single ? 1 : null),
    duration: durationOf(spell.duration),
    concentration: spell.concentration,
    ritual: spell.ritual,
    effect,
    upcast: upcastOf(spell),
    cantrip: cantripOf(spell),
    slice: SLICE.has(spell.spellId),
    complete: COMPLETE.has(spell.spellId),
  };
  return { ...derived, ...CURATED[spell.spellId] };
}
