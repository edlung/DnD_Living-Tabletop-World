import type { SrdClass } from '@ltw/contracts';

import classes from './classes.json' with { type: 'json' };

/**
 * The SRD's twelve classes as it gives them (docs/adr/0056-characters-from-the-srd.md §1), written
 * by `scripts/srd/import.ts`: core traits, the features table, the features and the subclass.
 */
export const SRD_CLASSES: readonly SrdClass[] = classes;
const byId = new Map(SRD_CLASSES.map((one) => [one.classId, one]));
export const srdClass = (classId: string): SrdClass | undefined => byId.get(classId);
