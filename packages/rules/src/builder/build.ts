import {
  CLASS_ORDERS,
  characterSheetSchema,
  type CharacterChoices,
  type CharacterSheet,
  type ChoiceProblem,
  type ClassId,
  type Skill,
  type SpellcastingSource,
  type SrdBackground,
  type SrdClass,
} from '@ltw/contracts';

import { abilityModifier } from '../character-math.ts';
import { srdClass } from '../srd/classes.ts';
import { srdBackground, srdFeat, srdSpecies } from '../srd/origins.ts';
import { baseScores, withIncreases } from './abilities.ts';
import { startingEquipment, type StartingItem } from './equipment.ts';
import { speciesGains } from './species.ts';
import { classSpellcasting, magicInitiateCasting } from './spells.ts';

/**
 * A level 1 character built from the builder's choices (docs/adr/0056-characters-from-the-srd.md
 * §2), only from the SRD's numbers: the World Engine calls it with its own dice and records what
 * it returns; a client may ask it for a preview. Every choice that does not hold is a problem; a
 * build with problems makes no sheet.
 */
export type BuildResult =
  | { readonly ok: true; readonly sheet: CharacterSheet; readonly items: readonly StartingItem[] }
  | { readonly ok: false; readonly problems: readonly ChoiceProblem[] };

/** Weapon Mastery at level 1, by class. */
const MASTERIES: Partial<Readonly<Record<ClassId, number>>> = {
  barbarian: 2,
  fighter: 3,
  paladin: 2,
  ranger: 2,
  rogue: 2,
};
const ORDERS: Partial<Readonly<Record<ClassId, readonly string[]>>> = {
  cleric: ['protector', 'thaumaturge'],
  druid: ['magician', 'warden'],
};

/**
 * The skills: the background's two, the class's chosen, then those a species lets the player
 * choose (Keen Senses' one, Skillful's one) and Skilled's three of any, in that order.
 */
function skillsOf(
  cls: SrdClass,
  background: SrdBackground,
  choices: CharacterChoices,
  species: { readonly count: number; readonly from: readonly Skill[] } | null,
  skilled: number,
  problems: ChoiceProblem[],
): { proficient: Skill[]; expertise: Skill[] } {
  const problem = (
    field: string,
    message: string,
    params?: Readonly<Record<string, string | number>>,
  ) => problems.push({ field, message, ...(params ? { params } : {}) });
  const { choose, from } = cls.creation.skills;
  if (choices.skills.length !== choose)
    problem('skills', 'Choose {count} skills', { count: choose });
  if (choices.skills.some((skill) => !from.includes(skill)))
    problem('skills', '{class} chooses from its own list', { class: cls.name });
  const own = species?.count ?? 0;
  if (choices.moreSkills.length !== own + skilled)
    problem('moreSkills', 'Choose {count} more skills', { count: own + skilled });
  if (choices.moreSkills.slice(0, own).some((skill) => !species?.from.includes(skill)))
    problem('moreSkills', 'Not one your species lets you choose');
  const all = [...background.skills, ...choices.skills, ...choices.moreSkills];
  if (new Set(all).size !== all.length)
    problem('skills', 'A skill your background gives, or one already chosen, is not chosen again');
  const expertise = choices.classId === 'rogue' ? 2 : 0;
  if (choices.expertise.length !== expertise)
    problem('expertise', expertise ? 'Choose 2 skills for Expertise' : 'No Expertise at level 1');
  if (choices.expertise.some((skill) => !all.includes(skill)))
    problem('expertise', 'Expertise is in a skill you are proficient in');
  return { proficient: [...new Set(all)], expertise: [...choices.expertise] };
}

function toolsOf(cls: SrdClass, background: SrdBackground, chosen: readonly string[]) {
  const picks = [cls.creation.tools.pick, background.creation.tools.pick].filter(
    (pick) => pick !== null,
  );
  const wanted = picks.reduce((sum, pick) => sum + pick.count, 0);
  const allowed = new Set(picks.flatMap((pick) => pick.from));
  const ok = chosen.length === wanted && chosen.every((tool) => allowed.has(tool));
  return {
    tools: [
      ...new Set([...cls.creation.tools.fixed, ...background.creation.tools.fixed, ...chosen]),
    ],
    wanted: ok ? null : wanted,
  };
}

function featsOf(
  background: SrdBackground,
  choices: CharacterChoices,
  versatile: boolean,
  problems: ChoiceProblem[],
): string[] {
  const feats = [background.featId];
  if (versatile) {
    const extra = choices.originFeat === undefined ? undefined : srdFeat(choices.originFeat);
    if (extra?.category !== 'Origin')
      problems.push({ field: 'originFeat', message: 'Choose an Origin feat' });
    else if (extra.featId === background.featId && !extra.repeatable)
      problems.push({ field: 'originFeat', message: 'Your background gives that feat' });
    else if (extra.featId === 'magic-initiate' && background.featId === 'magic-initiate')
      problems.push({ field: 'originFeat', message: 'Magic Initiate once, from your background' });
    else feats.push(extra.featId);
  } else if (choices.originFeat !== undefined)
    problems.push({ field: 'originFeat', message: 'Only a Human chooses another Origin feat' });
  if (choices.fightingStyle !== undefined) {
    if (choices.classId !== 'fighter')
      problems.push({ field: 'fightingStyle', message: 'A Fighter chooses it at level 1' });
    feats.push(choices.fightingStyle);
  } else if (choices.classId === 'fighter')
    problems.push({ field: 'fightingStyle', message: 'Choose a Fighting Style' });
  return feats;
}

/** The Magic Initiate list a background's feat names ("Magic Initiate (Cleric)"). */
const listNamed = (feat: string) => /\((Cleric|Druid|Wizard)\)/.exec(feat)?.[1]?.toLowerCase();

export function buildCharacter(choices: CharacterChoices, d6: () => number): BuildResult {
  const problems: ChoiceProblem[] = [];
  const problem = (
    field: string,
    message: string,
    params?: Readonly<Record<string, string | number>>,
  ) => problems.push({ field, message, ...(params ? { params } : {}) });
  const cls = srdClass(choices.classId);
  const species = srdSpecies(choices.speciesId);
  const background = srdBackground(choices.backgroundId);
  if (!cls || !species || !background) {
    if (!cls) problem('classId', 'No such class');
    if (!species) problem('speciesId', 'No such species');
    if (!background) problem('backgroundId', 'No such background');
    return { ok: false, problems };
  }
  const scores = withIncreases(
    baseScores(choices.abilities, d6, problems),
    choices.increases,
    background,
    problems,
  );
  const gains = speciesGains(species, choices.speciesOption, choices.size, problems);
  const feats = featsOf(background, choices, gains.originFeat, problems);
  const skilled = feats.filter((feat) => feat === 'skilled').length * 3;
  const skills = skillsOf(cls, background, choices, gains.skillChoice, skilled, problems);
  const { tools, wanted: toolsWanted } = toolsOf(cls, background, choices.tools);
  if (toolsWanted !== null)
    problem('tools', 'Choose {count} of the tools offered', { count: toolsWanted });
  const orders = ORDERS[choices.classId];
  if (orders && (choices.order === undefined || !orders.includes(choices.order)))
    problem('order', 'Choose one of: {options}', { options: orders.join(', ') });
  if (!orders && choices.order !== undefined)
    problem('order', '{class} has no order', { class: cls.name });
  const invocations = choices.classId === 'warlock' ? 1 : 0;
  const open = (cls.options?.entries ?? []).filter((one) => one.prerequisite === null);
  if (
    choices.invocations.length !== invocations ||
    choices.invocations.some((id) => !open.some((one) => one.optionId === id))
  )
    problem(
      'invocations',
      invocations ? 'Choose an invocation with no prerequisite' : 'No invocation at level 1',
    );
  const masteries = MASTERIES[choices.classId] ?? 0;
  if (new Set(choices.weaponMasteries).size !== masteries)
    problem('weaponMasteries', 'Choose {count} kinds of weapon', { count: masteries });
  const equipment = startingEquipment(cls, background, choices.equipment, problems);
  const casting = classSpellcasting(cls, choices, problems);
  const sources: SpellcastingSource[] = casting.source ? [casting.source] : [];
  if (feats.includes('magic-initiate')) {
    const initiate = choices.magicInitiate;
    const list = listNamed(background.feat);
    if (!initiate) problem('magicInitiate', 'Choose Magic Initiate’s spells');
    else {
      if (list !== undefined && initiate.list !== list)
        problem('magicInitiate.list', 'Your background’s feat is {feat}', {
          feat: background.feat,
        });
      sources.push(magicInitiateCasting(initiate, problems));
    }
  } else if (choices.magicInitiate) problem('magicInitiate', 'You have no Magic Initiate');
  if (gains.cantrips.length + gains.spells.length > 0) {
    if (!choices.speciesAbility) problem('speciesAbility', 'Choose the ability your lineage uses');
    else
      sources.push({
        source: 'species',
        ability: choices.speciesAbility,
        spells: [...gains.cantrips, ...gains.spells],
        ...(gains.spells[0]
          ? { freeCasts: { spellId: gains.spells[0], perLongRest: 2, used: 0 } }
          : {}),
      });
  }
  const dex = abilityModifier(scores.dex);
  const unarmored =
    choices.classId === 'barbarian'
      ? 10 + dex + abilityModifier(scores.con)
      : choices.classId === 'monk'
        ? 10 + dex + abilityModifier(scores.wis)
        : 10 + dex;
  const hp = Math.max(
    1,
    cls.creation.hitDie + abilityModifier(scores.con) + gains.hitPointsPerLevel,
  );
  const order = choices.order;
  const sheet: CharacterSheet = {
    classes: [{ classId: choices.classId, level: 1 }],
    abilities: scores,
    hitPoints: { max: hp, current: hp },
    ...(gains.resistances.length > 0 ? { resistances: [...gains.resistances] } : {}),
    armorClass: unarmored,
    speedFt: gains.speedFt,
    ...(gains.size === 'small' ? { size: 'small' as const } : {}),
    ...(gains.darkvision === null ? {} : { senses: { darkvision: gains.darkvision } }),
    savingThrows: [...cls.creation.savingThrows],
    skills,
    ...(choices.fightingStyle ? { fightingStyle: choices.fightingStyle } : {}),
    attacksPerAction: 1,
    weapons: [...equipment.weapons],
    ...(masteries > 0 ? { weaponMasteries: [...new Set(choices.weaponMasteries)] } : {}),
    spellSlots: { max: [...casting.slots], expended: casting.slots.map(() => 0) },
    spellcasting: sources,
    conditions: [],
    concentration: null,
    origin: {
      speciesId: species.speciesId,
      ...(choices.speciesOption ? { speciesOption: choices.speciesOption } : {}),
      backgroundId: background.backgroundId,
    },
    feats,
    tools,
    ...(order || invocations || choices.classId === 'wizard'
      ? {
          classChoices: {
            ...(order && (CLASS_ORDERS as readonly string[]).includes(order) ? { order } : {}),
            ...(invocations ? { invocations: [...choices.invocations] } : {}),
            ...(choices.classId === 'wizard' ? { spellbook: [...choices.spellbook] } : {}),
          },
        }
      : {}),
  };
  const valid = characterSheetSchema.safeParse(sheet);
  if (!valid.success)
    for (const issue of valid.error.issues) problem(`sheet.${issue.path.join('.')}`, issue.message);
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, sheet: valid.data ?? sheet, items: equipment.items };
}
