import type { LightLevel, Senses } from '@ltw/contracts';

/**
 * Light and sight (SRD 5.2.1; docs/adr/0050-the-world-around.md §1–3): Dim Light lightly obscures
 * and Darkness heavily; Darkvision within its range sees Dim Light as Bright and Darkness as Dim;
 * Blindsight and Truesight within theirs perceive whatever is there.
 */
export type Obscurement = 'none' | 'light' | 'heavy';

const LIFTED: Readonly<Record<LightLevel, LightLevel>> = {
  dark: 'dim',
  dim: 'bright',
  bright: 'bright',
};
const RANK: Readonly<Record<Obscurement, number>> = { none: 0, light: 1, heavy: 2 };

/** The light a viewer sees in a square `distanceFt` away. */
export function lightSeen(level: LightLevel, distanceFt: number, senses: Senses): LightLevel {
  return senses.darkvision !== undefined && distanceFt <= senses.darkvision ? LIFTED[level] : level;
}

/** How obscured a square is to a viewer: by its light as seen, and by its fog or foliage. */
export function obscurementSeen(
  level: LightLevel,
  marked: Obscurement,
  distanceFt: number,
  senses: Senses,
): Obscurement {
  const light = lightSeen(level, distanceFt, senses);
  const byLight: Obscurement = light === 'dark' ? 'heavy' : light === 'dim' ? 'light' : 'none';
  return RANK[marked] > RANK[byLight] ? marked : byLight;
}

/** Perceives what is within range whatever the light or the fog: Blindsight, Truesight. */
export const perceivesWithin = (senses: Senses, distanceFt: number): boolean =>
  (senses.blindsight !== undefined && distanceFt <= senses.blindsight) ||
  (senses.truesight !== undefined && distanceFt <= senses.truesight);
