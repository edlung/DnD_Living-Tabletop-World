import type { SrdEquipment } from '@ltw/contracts';

/** The SRD's equipment as its Equipment chapter gives it (docs/adr/0054-items-as-data.md §1). */
declare const entries: readonly SrdEquipment[];
export = entries;
