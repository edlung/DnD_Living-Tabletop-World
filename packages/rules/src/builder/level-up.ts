import {
  ABILITIES,
  FIGHTING_STYLES,
  SKILL_IDS,
  characterSheetSchema,
  type Ability,
  type CharacterSheet,
  type ChoiceProblem,
  type ClassId,
  type LevelUpChoices,
  type Skill,
  type SpellcastingSource,
  type SrdClass,
} from '@ltw/contracts';

import { abilityModifier, spellSlotsFor, totalLevel } from '../character-math.ts';
import { CLASS_HIT_DIE, attacksFor } from '../rest.ts';
import advancement from '../srd/advancement.json' with { type: 'json' };
import { classColumn, srdClass } from '../srd/classes.ts';
import { srdFeat } from '../srd/origins.ts';
import { withInvocationSpells } from '../features/invocations.ts';
import { CASTING_ABILITY, classCasting, classSpellList } from './spells.ts';

/**
 * A level gained (docs/adr/0056-characters-from-the-srd.md §3): the experience it needs, what the
 * class's new level asks — an Ability Score Improvement or a feat, cantrips and spells, a Fighting
 * Style, Expertise, invocations, Metamagic, weapon masteries, a new class's skill — and the next
 * sheet built from the player's choices with the World Engine's die for rolled hit points. A new
 * class needs 13 in the primary abilities of every class the character would have.
 */
export const experienceFor = (level: number): number =>
  advancement[Math.min(20, Math.max(1, level)) - 1]?.experience ?? 0;

/** The level a total of experience points reaches. */
export const levelForExperience = (experience: number): number =>
  advancement.filter((row) => row.experience <= experience).length;

export interface LevelAsks {
  readonly classId: ClassId;
  readonly classLevel: number;
  readonly newClass: boolean;
  readonly features: readonly string[];
  readonly subclass: string | null;
  readonly improvement: boolean;
  /** At level 19 the improvement may be an Epic Boon. */
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
}

const column = classColumn;
const delta = (cls: SrdClass, name: string, level: number) =>
  column(cls, name, level) - column(cls, name, level - 1);

/** A class's primary abilities as its core traits give them: "Strength or Dexterity" needs one. */
export function primaryAbilities(cls: SrdClass): { readonly any: boolean; readonly of: Ability[] } {
  const words = cls.core['Primary Ability'] ?? '';
  const names: Record<string, Ability> = {
    Strength: 'str',
    Dexterity: 'dex',
    Constitution: 'con',
    Intelligence: 'int',
    Wisdom: 'wis',
    Charisma: 'cha',
  };
  const of = words
    .split(/ or | and /)
    .map((word) => names[word.trim()])
    .filter((one): one is Ability => one !== undefined);
  return { any: / or /.test(words), of };
}

const meetsPrimary = (cls: SrdClass, scores: CharacterSheet['abilities']) => {
  const { any, of } = primaryAbilities(cls);
  const met = (ability: Ability) => scores[ability] >= 13;
  return any ? of.some(met) : of.every(met);
};

/**
 * The features table's names for a class level (an improvement it repeats at 8, 12 and 16 is
 * described once), a subclass's place in it by its own features' names; `shown` is the class in the
 * campaign's language, read at the same places.
 */
export function levelFeatures(cls: SrdClass, level: number, shown: SrdClass = cls): string[] {
  const words = shown.levels[level - 1]?.features ?? [];
  const subclass = cls.subclass.features.flatMap((one, index) =>
    one.level === level ? [shown.subclass.features[index]?.name ?? one.name] : [],
  );
  // "Fighter Subclass" at 3 is the subclass taken, with its first features.
  return (cls.levels[level - 1]?.features ?? []).flatMap((name, index) =>
    name === 'Subclass feature'
      ? subclass
      : [words[index] ?? name, ...(/ Subclass$/.test(name) ? subclass : [])],
  );
}

/** What a level in a class asks of the player; a string for a level that cannot be taken. */
export function levelAsks(sheet: CharacterSheet, classId: ClassId): LevelAsks | string {
  const cls = srdClass(classId);
  if (!cls) return 'No such class';
  if (totalLevel(sheet) >= 20) return 'The character is at level 20';
  const own = sheet.classes.find((entry) => entry.classId === classId);
  const newClass = own === undefined;
  if (newClass) {
    const all = [...sheet.classes.map((entry) => srdClass(entry.classId)), cls];
    if (all.some((one) => one && !meetsPrimary(one, sheet.abilities)))
      return 'A new class needs 13 in the primary abilities of every class the character would have';
  }
  const level = (own?.level ?? 0) + 1;
  const features = levelFeatures(cls, level);
  const casting = classCasting(cls, classId, level);
  const slots = casting?.slots ?? [];
  const maxSpellLevel = slots.reduce((max, value, index) => (value > 0 ? index + 1 : max), 0);
  const multiclassWords = cls.multiclass
    .map((block) => (block.kind === 'item' || block.kind === 'paragraph' ? block.text : ''))
    .join(' ');
  const skill = newClass && /proficiency in one skill/.test(multiclassWords);
  return {
    classId,
    classLevel: level,
    newClass,
    features,
    subclass: level === 3 ? cls.subclass.name : null,
    improvement: features.includes('Ability Score Improvement') || features.includes('Epic Boon'),
    epicBoon: features.includes('Epic Boon'),
    cantrips: delta(cls, 'Cantrips', level),
    spells: delta(cls, 'Prepared Spells', level),
    spellbook: classId === 'wizard' ? (level === 1 ? 6 : 2) : 0,
    maxSpellLevel,
    fightingStyle: features.includes('Fighting Style'),
    expertise: features.includes('Expertise') ? 2 : 0,
    invocations: delta(cls, 'Eldritch Invocations', level),
    metamagic: features.includes('Metamagic') ? 2 : 0,
    weaponMasteries: features.includes('Weapon Mastery')
      ? Math.max(column(cls, 'Weapon Mastery', level), 2)
      : delta(cls, 'Weapon Mastery', level),
    // "one skill of your choice from the Rogue's skill list", or of any (a Bard's).
    multiclassSkill: skill
      ? /skill list/.test(multiclassWords)
        ? [...cls.creation.skills.from]
        : [...SKILL_IDS]
      : null,
  };
}

/** The feat a level's improvement may take, and the scores its Ability Score Increase allows. */
function featIncrease(featId: string, level: number): { allowed: Ability[]; max: number } | string {
  const feat = srdFeat(featId);
  if (!feat || (feat.category !== 'General' && feat.category !== 'Epic Boon'))
    return 'Choose a General feat, or an Epic Boon at level 19';
  if (featId === 'ability-score-improvement') return 'Take the scores themselves';
  const needs = /Level (\d+)\+/.exec(feat.prerequisite ?? '');
  if (needs && level < Number(needs[1])) return 'Not yet: {feat} asks a higher level';
  const increase = feat.blocks.find(
    (block) => block.kind === 'paragraph' && block.head === 'Ability Score Increase',
  );
  const words = increase?.kind === 'paragraph' ? increase.text : '';
  const max = /maximum of (\d+)/.exec(words);
  const named = ABILITIES.filter((ability) =>
    new RegExp(
      {
        str: 'Strength',
        dex: 'Dexterity',
        con: 'Constitution',
        int: 'Intelligence',
        wis: 'Wisdom',
        cha: 'Charisma',
      }[ability],
    ).test(words),
  );
  return {
    allowed: /one ability score of your choice/.test(words) ? [...ABILITIES] : named,
    max: Number(max?.[1] ?? 20),
  };
}

export type LevelUpResult =
  | { readonly ok: true; readonly sheet: CharacterSheet; readonly asks: LevelAsks }
  | { readonly ok: false; readonly problems: readonly ChoiceProblem[] };

export function levelUpCharacter(
  sheet: CharacterSheet,
  choices: LevelUpChoices,
  die: (sides: number) => number,
): LevelUpResult {
  const problems: ChoiceProblem[] = [];
  const problem = (field: string, message: string, params?: Record<string, string | number>) =>
    problems.push({ field, message, ...(params ? { params } : {}) });
  const asks = levelAsks(sheet, choices.classId);
  if (typeof asks === 'string')
    return { ok: false, problems: [{ field: 'classId', message: asks }] };
  const cls = srdClass(choices.classId);
  if (!cls) return { ok: false, problems: [{ field: 'classId', message: 'No such class' }] };
  const newLevel = totalLevel(sheet) + 1;

  // Ability scores: the improvement, or a feat's increase.
  const abilities = { ...sheet.abilities };
  const feats = [...(sheet.feats ?? [])];
  const improvement = choices.improvement;
  if (asks.improvement && !improvement)
    problem('improvement', 'Choose the scores to raise, or a feat');
  if (!asks.improvement && improvement) problem('improvement', 'This level raises no score');
  if (asks.improvement && improvement?.kind === 'scores') {
    const plus = improvement.plus;
    const raised =
      plus.length === 1 ? [[plus[0], 2] as const] : plus.map((one) => [one, 1] as const);
    if (plus.length === 2 && plus[0] === plus[1])
      problem('improvement', 'Two different scores, +1 each');
    for (const [ability, by] of raised)
      if (ability) {
        if (abilities[ability] + by > 20) problem('improvement', 'A score goes no higher than 20');
        abilities[ability] = Math.min(20, abilities[ability] + by);
      }
    feats.push('ability-score-improvement');
  }
  if (asks.improvement && improvement?.kind === 'feat') {
    const increase = featIncrease(improvement.featId, newLevel);
    const feat = srdFeat(improvement.featId);
    if (typeof increase === 'string') problem('improvement', increase, { feat: feat?.name ?? '' });
    else {
      if (feat?.category === 'Epic Boon' && !asks.epicBoon)
        problem('improvement', 'An Epic Boon comes at level 19');
      if (feats.includes(improvement.featId) && !feat?.repeatable)
        problem('improvement', 'The character has that feat');
      const ability = improvement.ability;
      if (increase.allowed.length > 0) {
        if (!ability || !increase.allowed.includes(ability))
          problem('improvement', 'Choose the score the feat raises');
        else abilities[ability] = Math.min(increase.max, abilities[ability] + 1);
      }
      feats.push(improvement.featId);
    }
  }

  // Hit points: the level's, and a higher Constitution's for every level.
  const sides = CLASS_HIT_DIE[choices.classId];
  const con = abilityModifier(abilities.con);
  const rolled = choices.hitPoints === 'rolled' ? die(sides) : Math.floor(sides / 2) + 1;
  const toughness = sheet.origin?.speciesId === 'dwarf' ? 1 : 0;
  const gained =
    Math.max(1, rolled + con) +
    toughness +
    (con - abilityModifier(sheet.abilities.con)) * (newLevel - 1);

  // Skills: a new class's skill, Expertise.
  const proficient = new Set<Skill>(sheet.skills.proficient);
  if (asks.multiclassSkill) {
    if (!choices.multiclassSkill || !asks.multiclassSkill.includes(choices.multiclassSkill))
      problem('multiclassSkill', 'Choose the skill your new class gives');
    else if (proficient.has(choices.multiclassSkill))
      problem('multiclassSkill', 'A skill you have already');
    else proficient.add(choices.multiclassSkill);
  } else if (choices.multiclassSkill) problem('multiclassSkill', 'This level gives no skill');
  const expertise = new Set<Skill>(sheet.skills.expertise);
  if (choices.expertise.length !== asks.expertise)
    problem('expertise', 'Choose {count} skills for Expertise', { count: asks.expertise });
  for (const skill of choices.expertise) {
    if (!proficient.has(skill) || expertise.has(skill))
      problem('expertise', 'Expertise is in a skill you are proficient in');
    expertise.add(skill);
  }

  // The level's other choices.
  const choicesOf = sheet.classChoices ?? {};
  if (asks.fightingStyle !== (choices.fightingStyle !== undefined))
    problem(
      'fightingStyle',
      asks.fightingStyle ? 'Choose a Fighting Style' : 'This level gives no style',
    );
  if (choices.fightingStyle && feats.includes(choices.fightingStyle))
    problem('fightingStyle', 'The character has that style');
  if (choices.fightingStyle && FIGHTING_STYLES.includes(choices.fightingStyle))
    feats.push(choices.fightingStyle);
  const optionIds = (cls.options?.entries ?? []).map((one) => one.optionId);
  const takeOptions = (
    chosen: readonly string[],
    wanted: number,
    have: readonly string[],
    field: string,
  ) => {
    if (chosen.length !== wanted) problem(field, 'Choose {count} options', { count: wanted });
    if (chosen.some((id) => !optionIds.includes(id) || have.includes(id)))
      problem(field, 'Not an option you may take');
    return [...have, ...chosen];
  };
  const invocations = takeOptions(
    choices.invocations,
    asks.invocations,
    choicesOf.invocations ?? [],
    'invocations',
  );
  for (const id of choices.invocations) {
    const needs = /Level (\d+)\+ Warlock/.exec(
      cls.options?.entries.find((one) => one.optionId === id)?.prerequisite ?? '',
    );
    if (needs && asks.classLevel < Number(needs[1]))
      problem('invocations', 'Not yet: an invocation asks a higher Warlock level');
  }
  const metamagic = takeOptions(
    choices.metamagic,
    asks.metamagic,
    choicesOf.metamagic ?? [],
    'metamagic',
  );
  const masteries = new Set(sheet.weaponMasteries ?? []);
  if (choices.weaponMasteries.length !== asks.weaponMasteries)
    problem('weaponMasteries', 'Choose {count} kinds of weapon', { count: asks.weaponMasteries });
  for (const weapon of choices.weaponMasteries) masteries.add(weapon);

  // Spells: the new cantrips and prepared spells of the class's list, a Wizard's two spellbook ones.
  const known = new Set(sheet.spellcasting.flatMap((source) => source.spells));
  const check = (
    chosen: readonly string[],
    wanted: number,
    allowed: readonly string[],
    field: string,
  ) => {
    if (chosen.length !== wanted) problem(field, 'Choose {count}', { count: wanted });
    if (new Set(chosen).size !== chosen.length) problem(field, 'Each spell once');
    const wrong = chosen.filter((id) => !allowed.includes(id) || known.has(id));
    if (wrong.length > 0) problem(field, 'Not on the list: {spells}', { spells: wrong.join(', ') });
  };
  const levelList = (classId: ClassId) =>
    Array.from({ length: asks.maxSpellLevel }, (_, index) =>
      classSpellList(classId, index + 1),
    ).flat();
  check(choices.cantrips, asks.cantrips, classSpellList(choices.classId, 0), 'cantrips');
  const spellbook = [...(choicesOf.spellbook ?? []), ...choices.spellbook];
  const inBook = new Set(choicesOf.spellbook ?? []);
  check(
    choices.spellbook,
    asks.spellbook,
    levelList(choices.classId).filter((id) => !inBook.has(id)),
    'spellbook',
  );
  check(
    choices.spells,
    asks.spells,
    choices.classId === 'wizard' ? spellbook : levelList(choices.classId),
    'spells',
  );
  const ability = CASTING_ABILITY[choices.classId];
  // A Ranger's Favored Enemy: Hunter's Mark always prepared, its free casts by the table.
  const favored = choices.classId === 'ranger' ? column(cls, 'Favored Enemy', asks.classLevel) : 0;
  const adds = [
    ...choices.cantrips,
    ...choices.spells,
    ...(favored > 0 && asks.newClass ? ['hunters-mark'] : []),
  ];
  const free = (source: SpellcastingSource): SpellcastingSource =>
    favored > 0
      ? {
          ...source,
          freeCasts: {
            spellId: 'hunters-mark',
            perLongRest: favored,
            used: Math.min(favored, source.freeCasts?.used ?? 0),
          },
        }
      : source;
  const existing = sheet.spellcasting.some((source) => source.source === choices.classId);
  const spellcasting: SpellcastingSource[] = existing
    ? sheet.spellcasting.map((source) =>
        source.source === choices.classId
          ? free({ ...source, spells: [...source.spells, ...adds] })
          : source,
      )
    : ability && adds.length > 0
      ? [
          ...sheet.spellcasting,
          free({ source: choices.classId as SpellcastingSource['source'], ability, spells: adds }),
        ]
      : [...sheet.spellcasting];

  const classes = asks.newClass
    ? [...sheet.classes, { classId: choices.classId, level: 1 }]
    : sheet.classes.map((entry) =>
        entry.classId === choices.classId
          ? {
              ...entry,
              level: entry.level + 1,
              ...(asks.subclass ? { subclass: asks.subclass } : {}),
            }
          : entry,
      );
  const slots = spellSlotsFor(classes);
  // Pact Magic's slots are the Warlock's own.
  const warlock = classes.find((entry) => entry.classId === 'warlock');
  const pact = warlock
    ? classCasting(srdClass('warlock') as SrdClass, 'warlock', warlock.level)
    : null;
  const max = slots.map((value, index) => value + (pact?.slots[index] ?? 0));
  const next: CharacterSheet = {
    ...sheet,
    classes,
    abilities,
    hitPoints: {
      ...sheet.hitPoints,
      max: sheet.hitPoints.max + gained,
      current: sheet.hitPoints.current + gained,
    },
    skills: { proficient: [...proficient], expertise: [...expertise] },
    attacksPerAction: Math.max(sheet.attacksPerAction, attacksFor(classes)),
    spellSlots: {
      max,
      expended: max.map((value, index) => Math.min(value, sheet.spellSlots.expended[index] ?? 0)),
    },
    spellcasting,
    feats,
    ...(choices.fightingStyle && !sheet.fightingStyle
      ? { fightingStyle: choices.fightingStyle }
      : {}),
    ...(masteries.size > 0 ? { weaponMasteries: [...masteries] } : {}),
    classChoices: {
      ...choicesOf,
      ...(invocations.length > 0 ? { invocations } : {}),
      ...(metamagic.length > 0 ? { metamagic } : {}),
      ...(choices.classId === 'wizard' || choicesOf.spellbook ? { spellbook } : {}),
    },
  };
  // An invocation's at-will spells on the Warlock's casting (docs/adr/0056-…md §4).
  const valid = characterSheetSchema.safeParse(withInvocationSpells(next));
  if (!valid.success)
    for (const issue of valid.error.issues) problem(`sheet.${issue.path.join('.')}`, issue.message);
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, sheet: valid.data ?? next, asks };
}
