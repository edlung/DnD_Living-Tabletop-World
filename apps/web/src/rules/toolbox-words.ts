import type { ContagionId, TrapId } from '@ltw/contracts';

/**
 * The Gameplay Toolbox's names at the table (docs/adr/0055-rules-reference-and-toolbox.md §4),
 * English keys the dictionary translates: the traps, their tiers by level, the contagions.
 */
export const TRAP_WORDS: Readonly<Record<TrapId, string>> = {
  'collapsing-roof': 'Collapsing roof',
  'falling-net': 'Falling net',
  'fire-casting-statue': 'Fire-casting statue',
  'hidden-pit': 'Hidden pit',
  'poisoned-darts': 'Poisoned darts',
  'poisoned-needle': 'Poisoned needle',
  'rolling-stone': 'Rolling stone',
  'spiked-pit': 'Spiked pit',
};

/** A trap's tiers by the characters' levels; the rolling stone has one. */
export const trapTiers = (trapId: TrapId): readonly string[] =>
  trapId === 'rolling-stone' ? ['11–20'] : ['1–4', '5–10', '11–16', '17–20'];

export const CONTAGION_WORDS: Readonly<Record<ContagionId, string>> = {
  'cackle-fever': 'Cackle Fever',
  'sewer-plague': 'Sewer Plague',
  'sight-rot': 'Sight Rot',
};
