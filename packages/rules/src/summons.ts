import {
  ANIMATED_SIZES,
  ANIMATED_WEIGHT,
  SUMMON_OPTIONS,
  type AnimatedSize,
  type MonsterAttack,
  type StatBlock,
  type SummonChoice,
  type SummonOption,
  type Summoned,
  type SummonedCreature,
} from '@ltw/contracts';

import type { ReferenceLanguage } from './srd/reference-ru.ts';

/**
 * The creatures four spells summon (SRD 5.2.1; docs/adr/0056-characters-from-the-srd.md §5), their
 * stat blocks scaled by the slot the spell was cast with: an attack's bonus is the caster's spell
 * attack, a save's DC the caster's spell save DC. What the blocks hold beside the numbers the
 * engine plays — the steed's Life Bond and its bonus actions, a spider's web slowing its target, a
 * centipede's spew, the spirit's Shared Resistances, an object's damage carried over — is the
 * spell's words, and the DM's.
 */
export interface SummonCaster {
  /** The level of the slot the spell was cast with. */
  readonly level: number;
  readonly attackBonus: number;
  readonly saveDc: number;
  /** Its spellcasting ability's modifier: Animate Objects' count and a Large or Huge Slam. */
  readonly modifier: number;
}

export interface SummonedBody {
  readonly name: string;
  readonly block: StatBlock;
}

/** The most creatures one cast calls up: the records a command may create. */
export const MAX_SUMMONED = 9;

type Words = Readonly<Record<ReferenceLanguage, string>>;

const NAMES: Readonly<Record<SummonedCreature, Words>> = {
  'otherworldly-steed': { en: 'Otherworldly Steed', ru: 'Потусторонний скакун' },
  'giant-insect': { en: 'Giant Insect', ru: 'Гигантское насекомое' },
  'draconic-spirit': { en: 'Draconic Spirit', ru: 'Драконий дух' },
  'animated-object': { en: 'Animated Object', ru: 'Оживлённый предмет' },
};

const OPTION_NAMES: Readonly<Record<SummonOption | AnimatedSize, Words>> = {
  celestial: { en: 'Celestial', ru: 'Небожитель' },
  fey: { en: 'Fey', ru: 'Фея' },
  fiend: { en: 'Fiend', ru: 'Исчадие' },
  centipede: { en: 'Centipede', ru: 'многоножка' },
  spider: { en: 'Spider', ru: 'паук' },
  wasp: { en: 'Wasp', ru: 'оса' },
  acid: { en: 'Acid', ru: 'кислота' },
  cold: { en: 'Cold', ru: 'холод' },
  fire: { en: 'Fire', ru: 'огонь' },
  lightning: { en: 'Lightning', ru: 'молния' },
  poison: { en: 'Poison', ru: 'яд' },
  medium: { en: 'Medium', ru: 'Средний' },
  large: { en: 'Large', ru: 'Большой' },
  huge: { en: 'Huge', ru: 'Огромный' },
};

const ACTION_NAMES = {
  'otherworldly-slam': { en: 'Otherworldly Slam', ru: 'Потусторонний удар' },
  'poison-jab': { en: 'Poison Jab', ru: 'Ядовитый укол' },
  'web-bolt': { en: 'Web Bolt', ru: 'Сгусток паутины' },
  rend: { en: 'Rend', ru: 'Растерзание' },
  'breath-weapon': { en: 'Breath Weapon', ru: 'Оружие дыхания' },
  slam: { en: 'Slam', ru: 'Размашистый удар' },
} as const satisfies Readonly<Record<string, Words>>;

/** A summoned creature's name in the campaign's language, its option or size beside it. */
export function summonName(
  creature: SummonedCreature,
  option: SummonOption | AnimatedSize | undefined,
  language: ReferenceLanguage,
): string {
  const name = NAMES[creature][language];
  return option === undefined ? name : `${name} (${OPTION_NAMES[option][language]})`;
}

/** The lowest level each spell is cast at: the blocks' numbers start there. */
const LOWEST: Readonly<Record<SummonedCreature, number>> = {
  'otherworldly-steed': 2,
  'giant-insect': 4,
  'draconic-spirit': 5,
  'animated-object': 5,
};

/** Why a choice calls up nothing: no option, one its creature has not, or too many objects. */
export type SummonProblem = 'SUMMON_CHOICE';

/** The sizes Animate Objects animates, one entry per object, largest first. */
export function animatedSizes(choice: SummonChoice): AnimatedSize[] {
  const objects = choice.objects;
  if (!objects) return [];
  return [...ANIMATED_SIZES]
    .reverse()
    .flatMap((size) => Array.from({ length: objects[size] }, () => size));
}

/** Whether the choice fits the creature and the caster: what the World Engine checks first. */
export function summonProblem(
  creature: SummonedCreature,
  choice: SummonChoice | undefined,
  modifier: number,
): SummonProblem | null {
  if (creature === 'animated-object') {
    const sizes = choice ? animatedSizes(choice) : [];
    const weight = sizes.reduce((sum, size) => sum + ANIMATED_WEIGHT[size], 0);
    if (choice?.option !== undefined || sizes.length === 0 || sizes.length > MAX_SUMMONED)
      return 'SUMMON_CHOICE';
    return weight > Math.max(1, modifier) ? 'SUMMON_CHOICE' : null;
  }
  const options: readonly string[] = SUMMON_OPTIONS[creature];
  if (choice?.objects !== undefined || choice?.option === undefined) return 'SUMMON_CHOICE';
  return options.includes(choice.option) ? null : 'SUMMON_CHOICE';
}

const block = (
  numbers: Pick<StatBlock, 'armorClass' | 'speedFt' | 'abilities' | 'attacks'> &
    Partial<Omit<StatBlock, 'hitPoints'>> & { readonly hitPoints: number },
): StatBlock => {
  const { hitPoints, abilities, ...rest } = numbers;
  const mod = (score: number) => Math.floor((score - 10) / 2);
  return {
    savingThrows: {
      str: mod(abilities.str),
      dex: mod(abilities.dex),
      con: mod(abilities.con),
      int: mod(abilities.int),
      wis: mod(abilities.wis),
      cha: mod(abilities.cha),
    },
    initiativeBonus: mod(abilities.dex),
    attacksPerAction: 1,
    spells: [],
    conditions: [],
    ...rest,
    abilities,
    hitPoints: { max: hitPoints, current: hitPoints },
  };
};

const attack = (
  attackId: keyof typeof ACTION_NAMES,
  language: ReferenceLanguage,
  numbers: Omit<MonsterAttack, 'attackId' | 'name'>,
): MonsterAttack => ({ attackId, name: ACTION_NAMES[attackId][language], ...numbers });

const SLAM_TYPES = { celestial: 'radiant', fey: 'psychic', fiend: 'necrotic' } as const;

/**
 * The creatures a cast calls up, in the campaign's language, or why the choice calls up none.
 * Several only for Animate Objects, one per object.
 */
export function summonedBodies(
  creature: SummonedCreature,
  choice: SummonChoice | undefined,
  caster: SummonCaster,
  mark: Pick<Summoned, 'by' | 'spellId'>,
  language: ReferenceLanguage,
): readonly SummonedBody[] | SummonProblem {
  const problem = summonProblem(creature, choice, caster.modifier);
  if (problem) return problem;
  const level = Math.max(LOWEST[creature], caster.level);
  const option = choice?.option;
  const summoned: Summoned = {
    ...mark,
    creature,
    ...(option === undefined ? {} : { option }),
  };
  const half = Math.min(4, Math.max(1, Math.floor(level / 2)));
  if (creature === 'otherworldly-steed') {
    const type = SLAM_TYPES[option as keyof typeof SLAM_TYPES];
    return [
      {
        name: summonName(creature, option, language),
        block: block({
          size: 'large',
          armorClass: 10 + level,
          hitPoints: 5 + 10 * level,
          speedFt: 60,
          ...(level >= 4 ? { speeds: { fly: 60 } } : {}),
          abilities: { str: 18, dex: 12, con: 14, int: 6, wis: 12, cha: 8 },
          attacks: [
            attack('otherworldly-slam', language, {
              kind: 'melee',
              bonus: caster.attackBonus,
              reachFt: 5,
              damage: { count: 1, sides: 8, bonus: level, type },
            }),
          ],
          summoned,
        }),
      },
    ];
  }
  if (creature === 'giant-insect') {
    return [
      {
        name: summonName(creature, option, language),
        block: block({
          size: 'large',
          armorClass: 11 + level,
          hitPoints: 30 + 10 * (level - 4),
          speedFt: 40,
          speeds: option === 'wasp' ? { fly: 40, climb: 40 } : { climb: 40 },
          senses: { darkvision: 60 },
          abilities: { str: 17, dex: 13, con: 15, int: 4, wis: 14, cha: 3 },
          attacksPerAction: half,
          attacks: [
            attack('poison-jab', language, {
              kind: 'melee',
              bonus: caster.attackBonus,
              reachFt: 10,
              damage: { count: 1, sides: 6, bonus: 3 + level, type: 'piercing' },
              extraDamage: [{ count: 1, sides: 4, bonus: 0, type: 'poison' }],
            }),
            ...(option === 'spider'
              ? [
                  attack('web-bolt', language, {
                    kind: 'ranged',
                    bonus: caster.attackBonus,
                    normalRangeFt: 60,
                    longRangeFt: 60,
                    damage: { count: 1, sides: 10, bonus: 3 + level, type: 'bludgeoning' },
                  }),
                ]
              : []),
          ],
          summoned,
        }),
      },
    ];
  }
  if (creature === 'draconic-spirit') {
    return [
      {
        name: summonName(creature, option, language),
        block: block({
          size: 'large',
          armorClass: 14 + level,
          hitPoints: 50 + 10 * (level - 5),
          speedFt: 30,
          speeds: { fly: 60, swim: 30 },
          senses: { blindsight: 30, darkvision: 60 },
          resistances: ['acid', 'cold', 'fire', 'lightning', 'poison'],
          conditionImmunities: ['charmed', 'frightened', 'poisoned'],
          abilities: { str: 19, dex: 14, con: 17, int: 10, wis: 14, cha: 14 },
          attacksPerAction: half,
          attacks: [
            attack('rend', language, {
              kind: 'melee',
              bonus: caster.attackBonus,
              reachFt: 10,
              damage: { count: 1, sides: 6, bonus: 4 + level, type: 'piercing' },
            }),
          ],
          saveActions: [
            {
              actionId: 'breath-weapon',
              name: ACTION_NAMES['breath-weapon'][language],
              ability: 'dex',
              dc: caster.saveDc,
              area: { shape: 'cone', sizeFt: 30, widthFt: null, origin: 'self' },
              reachFt: null,
              rangeFt: null,
              damage: [{ count: 2, sides: 6, bonus: 0, type: option ?? 'fire' }],
              onSuccess: 'half',
              recharge: null,
              perDay: null,
              inMultiattack: true,
            },
          ],
          summoned,
        }),
      },
    ];
  }
  // Animate Objects: one creature per object, numbered when there are several.
  const sizes = choice ? animatedSizes(choice) : [];
  const above = level - 5;
  const SLAM = {
    medium: { count: 1 + above, sides: 4, bonus: 3, hp: 10 },
    large: { count: 2 + above, sides: 6, bonus: 3 + caster.modifier, hp: 20 },
    huge: { count: 2 + above, sides: 12, bonus: 3 + caster.modifier, hp: 40 },
  } as const;
  return sizes.map((size, index) => {
    const slam = SLAM[size];
    const name = summonName(creature, size, language);
    return {
      name: sizes.length > 1 ? `${name} ${String(index + 1)}` : name,
      block: block({
        size,
        armorClass: 15,
        hitPoints: slam.hp,
        speedFt: 30,
        senses: { blindsight: 30 },
        immunities: ['poison', 'psychic'],
        conditionImmunities: ['charmed', 'frightened', 'paralyzed', 'poisoned'],
        abilities: { str: 16, dex: 10, con: 10, int: 3, wis: 3, cha: 1 },
        attacks: [
          attack('slam', language, {
            kind: 'melee',
            bonus: caster.attackBonus,
            reachFt: 5,
            damage: {
              count: Math.min(20, slam.count),
              sides: slam.sides,
              bonus: slam.bonus,
              type: 'force',
            },
          }),
        ],
        summoned,
      }),
    };
  });
}
