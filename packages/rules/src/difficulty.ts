/**
 * A fight's difficulty (docs/adr/0053-monsters-as-data.md §3; SRD 5.2.1, "Combat Encounter
 * Difficulty"): each character's level gives an XP budget for a Low, a Moderate and a High
 * encounter; the party's budget is their sum. The foes' XP within the Low budget is Low, within the
 * Moderate one Moderate, within the High one High, and beyond it, beyond High.
 */
const BUDGET: readonly (readonly [number, number, number])[] = [
  [50, 75, 100],
  [100, 150, 200],
  [150, 225, 400],
  [250, 375, 500],
  [500, 750, 1100],
  [600, 1000, 1400],
  [750, 1300, 1700],
  [1000, 1700, 2100],
  [1300, 2000, 2600],
  [1600, 2300, 3100],
  [1900, 2900, 4100],
  [2200, 3700, 4700],
  [2600, 4200, 5400],
  [2900, 4900, 6200],
  [3300, 5400, 7800],
  [3800, 6100, 9800],
  [4500, 7200, 11700],
  [5000, 8700, 14200],
  [5500, 10700, 17200],
  [6400, 13200, 22000],
];

export const DIFFICULTY_RATINGS = ['low', 'moderate', 'high', 'beyond'] as const;
export type DifficultyRating = (typeof DIFFICULTY_RATINGS)[number];

export interface EncounterDifficulty {
  readonly xp: number;
  readonly budget: { readonly low: number; readonly moderate: number; readonly high: number };
  readonly rating: DifficultyRating;
}

export function encounterDifficulty(levels: readonly number[], xp: number): EncounterDifficulty {
  const sum = (index: 0 | 1 | 2) =>
    levels.reduce(
      (total, level) => total + (BUDGET[Math.min(20, Math.max(1, level)) - 1]?.[index] ?? 0),
      0,
    );
  const budget = { low: sum(0), moderate: sum(1), high: sum(2) };
  const rating: DifficultyRating =
    xp <= budget.low
      ? 'low'
      : xp <= budget.moderate
        ? 'moderate'
        : xp <= budget.high
          ? 'high'
          : 'beyond';
  return { xp, budget, rating };
}
