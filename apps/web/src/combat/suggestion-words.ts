import type { MonsterTurnSuggestion } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

/**
 * A creature's suggested turn in the table's own language (docs/adr/0075-book-interface.md §17):
 * what it would do and to whom, read from the suggestion's own command. The server's sentence
 * says more (the attack's name, the distance) but is written in English only, so an English
 * table reads that sentence and every other table these words.
 */
export function suggestionWords(
  t: Translate,
  suggestion: MonsterTurnSuggestion,
  labelOf: (entityId: string) => string,
): string {
  const { command } = suggestion;
  const target =
    'targetId' in command && typeof command.targetId === 'string'
      ? labelOf(command.targetId)
      : null;
  if (command.type === 'Attack' && target !== null) return t('attack {target}', { target });
  if (command.type === 'CastSpell')
    return target === null ? t('cast a spell') : t('cast a spell at {target}', { target });
  if (command.type === 'MoveCombatant') return t('move toward the nearest foe');
  return t('end the turn');
}
