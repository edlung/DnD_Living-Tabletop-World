import { srdBackgroundSchema, srdFeatSchema, srdSpeciesSchema } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { SRD_CLASSES } from './classes.ts';
import { SRD_BACKGROUNDS, SRD_FEATS, SRD_SPECIES, srdFeat } from './origins.ts';

/**
 * The SRD's origins and feats hold to their schemas and to each other (docs/adr/0056-characters-
 * from-the-srd.md §1): a background's feat is an Origin feat, a class's Fighting Style feature
 * picks among the Fighting Style feats, and each species' choices stand in its traits.
 */
describe('the SRD’s origins and feats', () => {
  it('are the four backgrounds, each raising three scores and giving an Origin feat', () => {
    expect(SRD_BACKGROUNDS.map((one) => one.name)).toEqual([
      'Acolyte',
      'Criminal',
      'Sage',
      'Soldier',
    ]);
    for (const one of SRD_BACKGROUNDS) {
      srdBackgroundSchema.parse(one);
      expect(new Set(one.abilityScores).size, one.name).toBe(3);
      expect(srdFeat(one.featId)?.category, one.name).toBe('Origin');
    }
  });

  it('are the nine species, each with its traits and its choices beside them', () => {
    expect(SRD_SPECIES.map((one) => one.name)).toEqual([
      'Dragonborn',
      'Dwarf',
      'Elf',
      'Gnome',
      'Goliath',
      'Halfling',
      'Human',
      'Orc',
      'Tiefling',
    ]);
    for (const one of SRD_SPECIES) srdSpeciesSchema.parse(one);
    const trait = (species: string, name: string) =>
      SRD_SPECIES.find((one) => one.name === species)?.traits.find((one) => one.name === name);
    const tables = (species: string, name: string) =>
      trait(species, name)?.blocks.flatMap((block) => (block.kind === 'table' ? [block] : []));
    expect(tables('Dragonborn', 'Draconic Ancestry')?.[0]?.rows).toHaveLength(10);
    expect(tables('Elf', 'Elven Lineage')?.[0]?.rows.map((row) => row[0])).toEqual([
      'Drow',
      'High Elf',
      'Wood Elf',
    ]);
    expect(tables('Tiefling', 'Fiendish Legacy')?.[0]?.rows).toHaveLength(3);
    expect(tables('Human', 'Versatile')).toEqual([]);
    // A lineage's options are its own, not traits of their own.
    expect(trait('Gnome', 'Forest Gnome')).toBeUndefined();
    expect(
      trait('Gnome', 'Gnomish Lineage')?.blocks.map((block) =>
        block.kind === 'paragraph' ? block.head : null,
      ),
    ).toEqual([null, 'Forest Gnome', 'Rock Gnome']);
  });

  it('are the feats by category, the fighting styles the classes choose among', () => {
    for (const one of SRD_FEATS) srdFeatSchema.parse(one);
    const named = (category: string) =>
      SRD_FEATS.filter((one) => one.category === category).map((one) => one.name);
    expect(named('Origin')).toEqual(['Alert', 'Magic Initiate', 'Savage Attacker', 'Skilled']);
    expect(named('General')).toEqual(['Ability Score Improvement', 'Grappler']);
    expect(named('Fighting Style')).toHaveLength(4);
    expect(named('Epic Boon')).toHaveLength(7);
    expect(SRD_FEATS.filter((one) => one.repeatable).map((one) => one.name)).toEqual([
      'Magic Initiate',
      'Skilled',
      'Ability Score Improvement',
    ]);
    const styles = SRD_CLASSES.filter((one) =>
      one.features.some((feature) => feature.name === 'Fighting Style'),
    ).map((one) => one.name);
    expect(styles).toEqual(['Fighter', 'Paladin', 'Ranger']);
  });
});
