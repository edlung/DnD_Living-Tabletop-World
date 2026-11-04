import type { SrdClass } from '@ltw/contracts';

import classes from './classes.json' with { type: 'json' };

/**
 * The SRD's twelve classes as it gives them (docs/adr/0056-characters-from-the-srd.md §1), written
 * by `scripts/srd/import.ts`: core traits, the features table, the features and the subclass.
 */
export const SRD_CLASSES: readonly SrdClass[] = classes;
const byId = new Map(SRD_CLASSES.map((one) => [one.classId, one]));
export const srdClass = (classId: string): SrdClass | undefined => byId.get(classId);

/** A number from the features table's column at a class level: "2", "+2 ft.", "1d6"; "—" is 0. */
export function classColumn(cls: SrdClass, name: string, level: number): number {
  const index = cls.columns.indexOf(name);
  const value = index < 0 || level < 1 ? undefined : cls.levels[level - 1]?.values[index];
  return value === undefined || value === '—' ? 0 : Number(/\d+/.exec(value)?.[0] ?? 0);
}
