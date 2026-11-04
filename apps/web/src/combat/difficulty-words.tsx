import type { EncounterDifficultyResponse, EncounterDifficultyView } from '@ltw/contracts';
import { useLanguage, useT, type Translate } from '@ltw/ui';

/**
 * A built encounter's difficulty for the party (docs/adr/0053-monsters-as-data.md §3; ADR 0057 §1),
 * in the words the running fight's line uses: the rating, the foes' XP and the party's budget.
 */
const RATING = { low: 'Low', moderate: 'Moderate', high: 'High', beyond: 'Beyond High' } as const;

export function difficultyText(
  t: Translate,
  number: Intl.NumberFormat,
  difficulty: EncounterDifficultyView,
): string {
  const line = t(
    'Difficulty: {rating}. Foes {xp} XP; the party’s budget: Low {low}, Moderate {moderate}, High {high}.',
    {
      rating: t(RATING[difficulty.rating]),
      xp: number.format(difficulty.xp),
      low: number.format(difficulty.budget.low),
      moderate: number.format(difficulty.budget.moderate),
      high: number.format(difficulty.budget.high),
    },
  );
  return difficulty.unknown > 0
    ? `${line} ${t('{count} without XP in their stat block.', { count: difficulty.unknown })}`
    : line;
}

export function DifficultyWords({
  preview,
}: {
  readonly preview: EncounterDifficultyResponse | null;
}) {
  const t = useT();
  const number = new Intl.NumberFormat(useLanguage());
  if (!preview) return null;
  const names = preview.party.map((member) => member.name).join(', ');
  return (
    <p className={`encounter-difficulty is-${preview.difficulty?.rating ?? 'none'}`} role="status">
      {preview.difficulty
        ? `${difficultyText(t, number, preview.difficulty)} ${t('For {names}.', { names })}`
        : t('Nobody of the party is at this place yet: the difficulty shows once someone is.')}
    </p>
  );
}
