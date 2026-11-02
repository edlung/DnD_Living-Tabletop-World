import type { Condition, ConditionNoteView } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

import { ABILITY_NAMES, signed } from '../character/words.ts';

/**
 * What each condition does, in one line, and how one ends in a fight (docs/adr/0045-conditions-
 * and-actions.md §1–3): English keys the client dictionary translates. The rules are the server's;
 * these words only remind the table of them.
 */
export const CONDITION_EFFECTS: Readonly<Record<Condition, string>> = {
  blinded: 'Its attacks have Disadvantage; attacks against it have Advantage.',
  charmed: 'It cannot attack its charmer or aim a spell at them.',
  deafened: 'It hears nothing: a check that needs hearing fails.',
  frightened:
    'Disadvantage on its checks and attacks while its fear is in sight; it cannot move closer.',
  grappled: 'Speed 0; Disadvantage on attacks against anyone but its grappler.',
  incapacitated: 'No action, bonus action or reaction; Concentration ends.',
  invisible: 'Its attacks have Advantage; attacks against it have Disadvantage.',
  paralyzed:
    'It cannot act or move and fails Strength and Dexterity saves; a hit from 5 ft is critical.',
  petrified: 'Turned to stone: it cannot act or move, and resists all damage.',
  poisoned: 'Disadvantage on its attacks and ability checks.',
  prone: 'Its attacks have Disadvantage; standing up costs half its Speed.',
  restrained:
    'Speed 0; its attacks and Dexterity saves have Disadvantage; attacks against it have Advantage.',
  slowed: 'Speed 10 ft less until the next turn of whoever slowed it.',
  stunned:
    'It cannot act and fails Strength and Dexterity saves; attacks against it have Advantage.',
  unconscious:
    'It cannot act or move and drops prone; attacks against it have Advantage, critical from 5 ft.',
};

/** Exhaustion's level in words, with its cost (§3). */
export const exhaustionWords = (t: Translate, level: number): string =>
  t('Exhaustion {level}: {penalty} to every d20 roll, Speed {feet} ft less.', {
    level,
    penalty: signed(-2 * level),
    feet: 5 * level,
  });

/** How a condition ends in a fight and what it comes from, in words; empty when nothing says. */
export function conditionNoteWords(t: Translate, note: ConditionNoteView): string {
  const name = (who: { readonly name: string | null }) => who.name ?? t('an unidentified creature');
  const parts: string[] = [];
  if (note.source) parts.push(t('from {name}', { name: name(note.source) }));
  if (note.until) {
    const words = {
      name: name(note.until.turnOf),
      turns: note.until.turns,
    };
    parts.push(
      note.until.at === 'start'
        ? note.until.turns === 1
          ? t('until the start of the next turn of {name}', words)
          : t('until the start of a turn of {name}; turns left: {turns}', words)
        : note.until.turns === 1
          ? t('until the end of the next turn of {name}', words)
          : t('until the end of a turn of {name}; turns left: {turns}', words),
    );
  }
  if (note.save) {
    parts.push(
      t('a {ability} save of DC {dc} ends it', {
        ability: t(ABILITY_NAMES[note.save.ability]),
        dc: note.save.dc,
      }),
    );
  }
  return parts.join(' · ');
}
