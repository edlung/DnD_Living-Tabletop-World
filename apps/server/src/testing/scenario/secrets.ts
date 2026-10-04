import { ASHEN_CIRCLE_ID } from '../ravenford-app.ts';

/**
 * Text the player must never receive anywhere in the Ravenford session
 * (RAVENFORD_SPEC.md, Integrity Acceptance): the canonical mystery truth, the
 * DM's notes, Orin's secret, the records nobody tells in this scenario, and
 * Gate 04's planted truths, notes, secrets, hidden name, description, and NPC
 * memories. What the party legitimately learns along the way (its own and
 * Elowen's records, clues, accounts it is told) is not listed.
 */
export const NEVER_FOR_PLAYERS: readonly string[] = [
  // WORLD_TRUTH.
  'Ashen',
  ASHEN_CIRCLE_ID,
  'rare alchemical reagents',
  'manipulated after the attack',
  'arranged to suggest a goblin attack',
  'not simply goblins',
  'mark of the Ashen',
  // DM notes.
  'Reveal the symbol',
  'goblin theory is wrong',
  // Orin's SECRET, and records no one is asked about here.
  'unusual reagent orders',
  'Orin knows Captain Thorne personally',
  'has not reported back',
  // Record IDs of the above.
  'truth-',
  'dm-reveal-pacing',
  'dm-goblin-theory-note',
  'orin-symbol-secret',
  'orin-knows-thorne',
  'thorne-missing-patrol',
  // Gate 04's planted secrets.
  'NBXTRUTH',
  'NBXDMNOTE',
  'NBXORINSECRET',
  'NBXHIDDENNAME',
  'NBXDESCRIPTION',
  'NBXMEMSECRET',
  'NBXMEMUNCITED',
  'NBXMIRAMEMORY',
  'NBXORINMEMORY',
];
