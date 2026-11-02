import type { SrdMonsterBlock } from './catalog.ts';

/** Each stat block's engine stats (docs/adr/0053-monsters-as-data.md §1). */
declare const entries: readonly SrdMonsterBlock[];
export = entries;
