import type { SrdMonster, SrdSpell, SrdSpellMechanics, StatBlock } from '@ltw/contracts';

import blocks from './monster-blocks.json' with { type: 'json' };
import monsters from './monsters.json' with { type: 'json' };
import mechanics from './spell-mechanics.json' with { type: 'json' };
import spells from './spells.json' with { type: 'json' };

/**
 * The SRD 5.2.1 catalogs (docs/adr/0051-srd-data.md §2): its spells and stat blocks as it gives
 * them, written by `scripts/srd/import.ts` and held to contracts' schemas by this folder's tests.
 * The attribution the SRD asks for is in NOTICE.md and on the app's About page. Each JSON file's
 * type is declared beside it (`*.d.json.ts`): the type checker reads that, never infers a literal
 * type for every entry of 1.8 MB of data.
 */
export const SRD_SPELLS: readonly SrdSpell[] = spells;
export const SRD_MONSTERS: readonly SrdMonster[] = monsters;
/** Each spell's mechanics layer (docs/adr/0052-spells-as-data.md §2), in the spells' order. */
export const SRD_SPELL_MECHANICS: readonly SrdSpellMechanics[] = mechanics;

const spellsById = new Map(SRD_SPELLS.map((spell) => [spell.spellId, spell]));
const monstersById = new Map(SRD_MONSTERS.map((monster) => [monster.monsterId, monster]));
const mechanicsById = new Map(SRD_SPELL_MECHANICS.map((entry) => [entry.spellId, entry]));

export const srdSpell = (spellId: string): SrdSpell | undefined => spellsById.get(spellId);
export const srdMonster = (monsterId: string): SrdMonster | undefined =>
  monstersById.get(monsterId);
export const srdSpellMechanics = (spellId: string): SrdSpellMechanics | undefined =>
  mechanicsById.get(spellId);

/**
 * Each stat block's engine stats (docs/adr/0053-monsters-as-data.md §1), read from its text: the
 * stat block a creature from the catalog fights with, and the actions it read into attacks.
 */
export interface SrdMonsterBlock {
  readonly monsterId: string;
  readonly statBlock: StatBlock;
  readonly read: readonly string[];
}
export const SRD_MONSTER_BLOCKS: readonly SrdMonsterBlock[] = blocks;
const blocksById = new Map(SRD_MONSTER_BLOCKS.map((entry) => [entry.monsterId, entry]));
export const srdMonsterBlock = (monsterId: string): SrdMonsterBlock | undefined =>
  blocksById.get(monsterId);
