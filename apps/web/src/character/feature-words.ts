import type {
  AppliedFeatureId,
  ClassResource,
  FeatureAct,
  MetamagicId,
  ResourceRecharge,
} from '@ltw/contracts';

import type { GlyphName } from '../visual/ui-kit-names.ts';

/**
 * The words of the class features in play (docs/adr/0056-characters-from-the-srd.md §4): each
 * resource's name as the SRD gives it, its glyph, the rest that gives it back, and what the World
 * Engine applies of it — the rest of a feature is the DM's, in its own words below.
 */
export const RESOURCE_NAMES: Readonly<Record<ClassResource, string>> = {
  rage: 'Rage',
  'bardic-inspiration': 'Bardic Inspiration',
  'channel-divinity': 'Channel Divinity',
  'wild-shape': 'Wild Shape',
  'second-wind': 'Second Wind',
  'action-surge': 'Action Surge',
  indomitable: 'Indomitable',
  focus: 'Focus Points',
  'lay-on-hands': 'Lay On Hands',
  'sorcery-points': 'Sorcery Points',
  'innate-sorcery': 'Innate Sorcery',
  'arcane-recovery': 'Arcane Recovery',
  'magical-cunning': 'Magical Cunning',
};

export const RESOURCE_GLYPHS: Readonly<Record<ClassResource, GlyphName>> = {
  rage: 'melee',
  'bardic-inspiration': 'perform',
  'channel-divinity': 'blessing',
  'wild-shape': 'character',
  'second-wind': 'hit-points',
  'action-surge': 'initiative',
  indomitable: 'reaction',
  focus: 'concentration',
  'lay-on-hands': 'hit-points',
  'sorcery-points': 'generate',
  'innate-sorcery': 'generate',
  'arcane-recovery': 'chapter',
  'magical-cunning': 'chapter',
};

export const RECHARGE_WORDS: Readonly<Record<ResourceRecharge, string>> = {
  'short-one': 'One back after a short rest, all after a long rest.',
  'short-all': 'All back after a short or a long rest.',
  long: 'All back after a long rest.',
};

/** What the World Engine does with a use: what it does not is the DM's, from the feature's words. */
export const RESOURCE_EFFECTS: Readonly<Record<ClassResource, string>> = {
  rage: 'Bonus Action. Resistance to bludgeoning, piercing and slashing damage, the Rage Damage bonus with Strength attacks and Advantage on Strength checks and saves until it ends; not in heavy armor.',
  'bardic-inspiration':
    'Bonus Action. A creature within 60 ft holds your Bardic Inspiration die for an hour.',
  'channel-divinity': 'Magic action. The DM applies its effect.',
  'wild-shape': 'Bonus Action. The DM applies the form.',
  'second-wind': 'Bonus Action. You regain 1d10 + your Fighter level hit points.',
  'action-surge': 'After your action: one more action this turn, not a Magic action.',
  indomitable: 'After a failed saving throw: the DM rerolls it with your Fighter level added.',
  focus: 'Bonus Action. Patient Defense and Step of the Wind apply; the DM applies the rest.',
  'lay-on-hands':
    'Bonus Action. Hit points from the pool to a creature you touch, or five points to end its Poisoned condition.',
  'sorcery-points':
    'Font of Magic: a spell slot from points with a Bonus Action, or points from a slot; Metamagic is spent as you cast.',
  'innate-sorcery': 'Bonus Action. The DM applies its benefits for a minute.',
  'arcane-recovery':
    'Out of a fight, as a short rest ends: expended slots worth up to half your Wizard level, none of 6th level or higher.',
  'magical-cunning': 'Out of a fight: half your Pact Magic slots back, rounded up.',
};

/** The use's button: the feature's verb where its name is no verb. */
export const ACT_WORDS: Readonly<Record<FeatureAct, string>> = {
  rage: 'Rage',
  'end-rage': 'End the Rage',
  'bardic-inspiration': 'Inspire',
  'inspiration-die': 'Roll the die',
  'channel-divinity': 'Use Channel Divinity',
  'wild-shape': 'Use Wild Shape',
  'second-wind': 'Use Second Wind',
  'action-surge': 'Use Action Surge',
  indomitable: 'Use Indomitable',
  focus: 'Spend a Focus Point',
  'lay-on-hands': 'Heal',
  'sorcery-points': 'Spend Sorcery Points',
  'innate-sorcery': 'Use Innate Sorcery',
  'arcane-recovery': 'Recover the slots',
  'magical-cunning': 'Use Magical Cunning',
};

/** Focus's own uses (SRD 5.2.1, Monk's Focus): one point each. */
export const FOCUS_USES = ['flurry-of-blows', 'patient-defense', 'step-of-the-wind'] as const;
export const FOCUS_WORDS: Readonly<Record<(typeof FOCUS_USES)[number], string>> = {
  'flurry-of-blows': 'Flurry of Blows',
  'patient-defense': 'Patient Defense',
  'step-of-the-wind': 'Step of the Wind',
};

/** The features the World Engine applies on its own, each in a sentence with its number. */
export const APPLIED_WORDS: Readonly<Record<AppliedFeatureId, string>> = {
  'sneak-attack':
    'Sneak Attack: +{amount}d6 once a turn on a hit with a Finesse or Ranged weapon, with Advantage or an ally beside the target.',
  'improved-critical': 'Improved Critical: a Critical Hit on a 19 or 20.',
  'superior-critical': 'Superior Critical: a Critical Hit on an 18, 19 or 20.',
  'martial-arts': 'Martial Arts: a d{amount} and Dexterity for Unarmed Strikes and Monk weapons.',
  'unarmored-defense':
    'Unarmored Defense: without armor, your Armor Class adds your class’s ability; armor or a shield is measured from it.',
  'fast-movement': 'Fast Movement: +{amount} ft of Speed out of heavy armor.',
  'unarmored-movement': 'Unarmored Movement: +{amount} ft of Speed in no armor.',
  'danger-sense': 'Danger Sense: Advantage on Dexterity saving throws.',
  'feral-instinct': 'Feral Instinct: Advantage on Initiative.',
  'remarkable-athlete': 'Remarkable Athlete: Advantage on Initiative and Athletics checks.',
  evasion: 'Evasion: no damage from a Dexterity save for half you make, half from one you fail.',
  'reliable-talent':
    'Reliable Talent: a d20 under 10 counts as 10 for a skill you are proficient in.',
  'jack-of-all-trades': 'Jack of All Trades: +{amount} to the skills you lack.',
};

/** The Metamagic options' names, as the SRD gives them. */
export const METAMAGIC_NAMES: Readonly<Record<MetamagicId, string>> = {
  'careful-spell': 'Careful Spell',
  'distant-spell': 'Distant Spell',
  'empowered-spell': 'Empowered Spell',
  'extended-spell': 'Extended Spell',
  'heightened-spell': 'Heightened Spell',
  'quickened-spell': 'Quickened Spell',
  'seeking-spell': 'Seeking Spell',
  'subtle-spell': 'Subtle Spell',
  'transmuted-spell': 'Transmuted Spell',
  'twinned-spell': 'Twinned Spell',
};
