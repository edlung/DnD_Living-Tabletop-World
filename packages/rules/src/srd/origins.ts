import type { SrdBackground, SrdFeat, SrdSpecies } from '@ltw/contracts';

import backgrounds from './backgrounds.json' with { type: 'json' };
import feats from './feats.json' with { type: 'json' };
import species from './species.json' with { type: 'json' };

/**
 * The SRD's backgrounds, species and feats as it gives them (docs/adr/0056-characters-from-the-
 * srd.md §1), written by `scripts/srd/import.ts`.
 */
export const SRD_BACKGROUNDS: readonly SrdBackground[] = backgrounds;
export const SRD_SPECIES: readonly SrdSpecies[] = species;
export const SRD_FEATS: readonly SrdFeat[] = feats;

const backgroundById = new Map(SRD_BACKGROUNDS.map((one) => [one.backgroundId, one]));
const speciesById = new Map(SRD_SPECIES.map((one) => [one.speciesId, one]));
const featById = new Map(SRD_FEATS.map((one) => [one.featId, one]));
export const srdBackground = (id: string): SrdBackground | undefined => backgroundById.get(id);
export const srdSpecies = (id: string): SrdSpecies | undefined => speciesById.get(id);
export const srdFeat = (id: string): SrdFeat | undefined => featById.get(id);
