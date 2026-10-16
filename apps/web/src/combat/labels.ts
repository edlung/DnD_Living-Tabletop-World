import type { EncounterView } from '@ltw/contracts';
import { combatantLabels, useT, type Translate } from '@ltw/ui';

/** A combatant's label by entity ID: its name, or "Unidentified creature N" — never its ID. */
export type LabelOf = (entityId: string) => string;

/**
 * The labels of an encounter's combatants as this perspective may show them (design §5.5):
 * the projection's name, else a stable "Unidentified creature N" (`combatantLabels`). Tokens,
 * the turn order, cards, options, the turn banner and every square's name use the same words.
 */
export function labelsOf(encounter: EncounterView, t: Translate): LabelOf {
  const labels = combatantLabels(encounter, t);
  return (entityId) => labels.get(entityId) ?? t('Unidentified creature');
}

export function useCombatantLabels(encounter: EncounterView): LabelOf {
  return labelsOf(encounter, useT());
}

/** A label's words and its trailing number ("Unidentified creature" and "3"), if it has one. */
export function splitLabel(label: string): {
  readonly words: string;
  readonly number: string | null;
} {
  const match = /^(.*\S)\s+(\d+)$/.exec(label);
  return match?.[1] && match[2]
    ? { words: match[1], number: match[2] }
    : { words: label, number: null };
}
