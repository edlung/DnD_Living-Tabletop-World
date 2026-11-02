import type { SrdMonster, SrdSpell } from '@ltw/contracts';

import monsters from './monsters.json' with { type: 'json' };
import spells from './spells.json' with { type: 'json' };

/**
 * The SRD 5.2.1 catalogs (docs/adr/0051-srd-data.md §2): its spells and stat blocks as it gives
 * them, written by `scripts/srd/import.ts` and held to contracts' schemas by this folder's tests.
 * The attribution the SRD asks for is in NOTICE.md and on the app's About page.
 */
// The JSON's schools and spell lists read as strings: the tests hold them to the schema's words.
export const SRD_SPELLS: readonly SrdSpell[] = spells as readonly SrdSpell[];
export const SRD_MONSTERS: readonly SrdMonster[] = monsters;

const spellsById = new Map(SRD_SPELLS.map((spell) => [spell.spellId, spell]));
const monstersById = new Map(SRD_MONSTERS.map((monster) => [monster.monsterId, monster]));

export const srdSpell = (spellId: string): SrdSpell | undefined => spellsById.get(spellId);
export const srdMonster = (monsterId: string): SrdMonster | undefined =>
  monstersById.get(monsterId);
