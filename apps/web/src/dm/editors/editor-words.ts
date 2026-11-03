import type { ClueMethod, LocationType } from '@ltw/contracts';

/**
 * The DM's editors in words (docs/adr/0058-campaign-content.md §1): the kinds of place, the ways a
 * clue is found, who may know a thing.
 */
export const PLACE_KINDS: Readonly<Record<LocationType, string>> = {
  region: 'A region',
  settlement: 'A settlement',
  district: 'A district',
  site: 'A site',
  building: 'A building',
  room: 'A room',
  route: 'A road or path',
};

export const CLUE_WAYS: Readonly<Record<ClueMethod, string>> = {
  inspect: 'Seen by looking at it',
  investigation: 'Found by Intelligence (Investigation)',
  perception: 'Noticed by Wisdom (Perception)',
  magic: 'Revealed by Detect Magic',
};

/** Who knows a thing, as the knowledge editor offers it. */
export const KNOWERS = ['PARTY', 'PUBLIC', 'CHARACTER', 'NPC'] as const;
export type Knower = (typeof KNOWERS)[number];
export const KNOWER_WORDS: Readonly<Record<Knower, string>> = {
  PARTY: 'The party',
  PUBLIC: 'Everyone',
  CHARACTER: 'One character',
  NPC: 'One person of the world',
};

/** A new thing's ID: its kind and eight random hex digits, as the World Engine's IDs look. */
export const freshId = (prefix: string): string => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
