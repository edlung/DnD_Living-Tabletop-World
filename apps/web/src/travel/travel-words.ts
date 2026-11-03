import type { TravelPace, TravelTerrain } from '@ltw/contracts';

/**
 * Travel in words (docs/adr/0057-encounters-maps-loot.md §10; SRD 5.2.1 "Travel Pace", "Travel
 * Terrain"): each pace, what it does to checks on the way, and each terrain.
 */
export const PACE_WORDS: Readonly<Record<TravelPace, string>> = {
  fast: 'fast pace',
  normal: 'normal pace',
  slow: 'slow pace',
};

export const PACE_NAMES: Readonly<Record<TravelPace, string>> = {
  fast: 'Fast pace',
  normal: 'Normal pace',
  slow: 'Slow pace',
};

export const PACE_EFFECTS: Readonly<Record<TravelPace, string>> = {
  fast: '4 miles an hour. Disadvantage on Wisdom (Perception or Survival) and Dexterity (Stealth) checks.',
  normal: '3 miles an hour. Disadvantage on Dexterity (Stealth) checks.',
  slow: '2 miles an hour. Advantage on Wisdom (Perception or Survival) checks.',
};

export const TERRAIN_WORDS: Readonly<Record<TravelTerrain, string>> = {
  arctic: 'arctic',
  coastal: 'coastal',
  desert: 'desert',
  forest: 'forest',
  grassland: 'grassland',
  hill: 'hills',
  mountain: 'mountains',
  swamp: 'swamp',
  underdark: 'Underdark',
  urban: 'town',
};
