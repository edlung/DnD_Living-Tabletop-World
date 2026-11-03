import type { Mechanics } from './spell-mechanics.ts';

const DAY = 24 * 60 * 60;
const YEAR = 365 * DAY;

/**
 * The mechanics the text's wording does not give regularly (docs/adr/0052-spells-as-data.md §4),
 * written from each spell's SRD text: they override what `deriveMechanics` reads.
 */
export const CURATED: Readonly<Record<string, Partial<Mechanics>>> = {
  // Three darts of 1d4 + 1 Force, one more for each slot level above 1.
  'magic-missile': {
    targets: 3,
    effect: {
      kind: 'auto',
      darts: 3,
      damage: { dice: { count: 1, sides: 4, bonus: 1 }, type: 'force' },
    },
    upcast: { dice: null, damageType: null, targets: null, darts: 1 },
  },
  // Three rays, an attack each; one more ray for each slot level above 2.
  'scorching-ray': {
    targets: 3,
    effect: {
      kind: 'attack',
      attack: 'ranged',
      damage: [{ dice: { count: 2, sides: 6, bonus: 0 }, type: 'fire' }],
    },
    upcast: { dice: null, damageType: null, targets: 1, darts: null },
  },
  // The 2d4 at the end of the target's next turn is the DM's.
  'acid-arrow': {
    effect: {
      kind: 'attack',
      attack: 'ranged',
      damage: [{ dice: { count: 4, sides: 4, bonus: 0 }, type: 'acid' }],
    },
  },
  // The first bolt strikes creatures within 5 feet of a point under the cloud.
  'call-lightning': {
    area: { shape: 'sphere', sizeFt: 5, widthFt: null, origin: 'point' },
    targets: null,
  },
  // The first target and up to three others within 30 feet of it.
  'chain-lightning': { targets: 4 },
  // A 10-foot square of ground.
  grease: { area: { shape: 'cube', sizeFt: 10, widthFt: null, origin: 'point' }, targets: null },
  // Its higher slot adds 5 Temporary Hit Points a level, which the DM applies.
  'false-life': { upcast: null },
  // The dead returned (docs/adr/0056-characters-from-the-srd.md §5): dead within a minute, with
  // 1 Hit Point; old age, missing parts and the diamond stay the DM's.
  revivify: {
    targets: 1,
    effect: { kind: 'revive', withinSeconds: 60, hitPoints: 'one', ordeal: false, cures: 'none' },
  },
  // Dead no longer than 10 days, with 1 Hit Point, poisons neutralized; an ordeal.
  'raise-dead': {
    targets: 1,
    effect: {
      kind: 'revive',
      withinSeconds: 10 * DAY,
      hitPoints: 'one',
      ordeal: true,
      cures: 'poison',
    },
  },
  // Dead no more than a century, with all its Hit Points, poisons neutralized; an ordeal. What a
  // year dead or more costs the caster is the DM's.
  resurrection: {
    targets: 1,
    effect: {
      kind: 'revive',
      withinSeconds: 100 * YEAR,
      hitPoints: 'all',
      ordeal: true,
      cures: 'poison',
    },
  },
  // Dead no longer than 200 years, with all its Hit Points; poison and magical contagions cured.
  'true-resurrection': {
    targets: 1,
    effect: {
      kind: 'revive',
      withinSeconds: 200 * YEAR,
      hitPoints: 'all',
      ordeal: false,
      cures: 'poison-contagion',
    },
  },
  // The four summons a slot's level scales (docs/adr/0056-characters-from-the-srd.md §5): the
  // creature's stat block from `packages/rules/src/summons.ts`; its other traits the DM's.
  'find-steed': { effect: { kind: 'summon', creature: 'otherworldly-steed' }, targets: null },
  'giant-insect': { effect: { kind: 'summon', creature: 'giant-insect' }, targets: null },
  'summon-dragon': { effect: { kind: 'summon', creature: 'draconic-spirit' }, targets: null },
  'animate-objects': { effect: { kind: 'summon', creature: 'animated-object' }, targets: null },
  // Lasting zones, walls and summons whose cast harms no one at once, areas the board cannot lay
  // out (Fire Storm's ten cubes, Meteor Swarm's four spheres) and a summoned hand: the DM's.
  ...Object.fromEntries(
    [
      'arcane-hand',
      'blade-barrier',
      'conjure-animals',
      'conjure-celestial',
      'conjure-woodland-beings',
      'control-water',
      'earthquake',
      'faithful-hound',
      'fire-storm',
      'flaming-sphere',
      'holy-aura',
      'meteor-swarm',
      'prismatic-wall',
      'sleet-storm',
      'spirit-guardians',
      'stinking-cloud',
      'storm-of-vengeance',
      'symbol',
      'tsunami',
      'wall-of-fire',
      'wall-of-ice',
      'wall-of-thorns',
      'web',
      'wind-wall',
    ].map((spellId) => [spellId, { effect: { kind: 'dm' }, targets: null, upcast: null } as const]),
  ),
};

/**
 * Spells whose effect is everything they do, so the server resolves them whole (§2): read against
 * their text. Others still roll what their effect names; the DM applies the rest.
 */
export const COMPLETE = new Set([
  'acid-splash',
  'burning-hands',
  'circle-of-death',
  'cone-of-cold',
  'cure-wounds',
  'eldritch-blast',
  'fire-bolt',
  'flame-strike',
  'inflict-wounds',
  'lightning-bolt',
  'magic-missile',
  'mass-cure-wounds',
  'mass-healing-word',
  'poison-spray',
  'scorching-ray',
]);
