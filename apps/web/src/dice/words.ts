import type { RollEntry, RollGroup, RollSubject } from '@ltw/contracts';
import { readableLabel, type Translate } from '@ltw/ui';

import { ABILITY_NAMES, skillName, spellName } from '../character/words.ts';

/** The dice's words (Stage 510): English keys the client dictionary translates. */
export function subjectWords(t: Translate, subject: RollSubject): string {
  switch (subject.kind) {
    case 'attack': {
      const weapon = readableLabel(subject.attack, t);
      if (subject.by === 'opportunity') return t('Opportunity attack: {weapon}', { weapon });
      if (subject.by === 'readied') return t('Readied attack: {weapon}', { weapon });
      // The extra attacks (docs/adr/0047-weapons.md §2, §4).
      if (subject.by === 'offhand') return t('Other hand: {weapon}', { weapon });
      if (subject.by === 'cleave') return t('Cleave: {weapon}', { weapon });
      if (subject.by === 'legendary') return t('Legendary: {weapon}', { weapon });
      return t('{weapon} attack', { weapon });
    }
    case 'spell':
      return spellName(t, subject.spellId);
    case 'skill':
      return t('{skill} check', { skill: skillName(t, subject.skill) });
    case 'ability':
      return t('{ability} check', { ability: t(ABILITY_NAMES[subject.ability]) });
    case 'save':
      return t('{ability} saving throw', { ability: t(ABILITY_NAMES[subject.ability]) });
    case 'death-save':
      return t('Death saving throw');
    case 'initiative':
      return t('Initiative');
    case 'hit-die':
      return t('Hit Point Die');
    case 'dice':
      return t('Dice');
    case 'table':
      return t('Table: {name}', { name: subject.name });
  }
}

/** A random table's result (docs/adr/0058-campaign-content.md §4): the DM's words, as written. */
export const tableResult = (entry: RollEntry): string | null =>
  entry.subject.kind === 'table' ? entry.subject.result : null;

export const rollerWords = (t: Translate, roller: RollEntry['roller']): string =>
  roller === null ? t('DM') : (roller.name ?? t('Someone at the table'));

const PURPOSE: Readonly<Record<RollGroup['purpose'], string>> = {
  attack: 'Attack roll',
  damage: 'Damage',
  healing: 'Healing',
  check: 'Check',
  save: 'Save',
  'death-save': 'Death save',
  initiative: 'Initiative',
  'hit-die': 'Hit Point Die',
  // A noun, as on the plate: "Roll" alone is the button's verb in Russian.
  dice: 'Dice roll',
};

export const purposeWords = (t: Translate, group: RollGroup): string => t(PURPOSE[group.purpose]);

/** "15 + 11 = 26": the counted dice, the modifier and the total (a lone die is just its total). */
export function sumWords(group: RollGroup): string {
  const counted = group.dice.filter((die) => !die.dropped).map((die) => String(die.value));
  const modifier =
    group.modifier === 0
      ? []
      : [group.modifier > 0 ? `+ ${String(group.modifier)}` : `− ${String(-group.modifier)}`];
  if (counted.length === 0) return String(group.total);
  const parts = [counted.join(' + '), ...modifier];
  return counted.length === 1 && modifier.length === 0
    ? String(group.total)
    : `${parts.join(' ')} = ${String(group.total)}`;
}

export function resultWords(t: Translate, group: RollGroup): string | null {
  if (group.critical) return t('Critical hit!');
  switch (group.result) {
    case 'hit':
      return t('Hit');
    case 'miss':
      return t('Miss');
    case 'success':
      return t('Success');
    case 'failure':
      return t('Failure');
    default:
      return null;
  }
}

/** The whole roll in one sentence, for the polite announcement and the log. */
export function rollSentence(t: Translate, entry: RollEntry): string {
  const lines = entry.groups.map((group) => {
    const result = resultWords(t, group);
    return `${purposeWords(t, group)}: ${sumWords(group)}${result ? ` — ${result}` : ''}`;
  });
  const subject = subjectWords(t, entry.subject);
  const what =
    entry.rerollOf === undefined ? subject : `${subject}, ${t('Heroic Inspiration reroll')}`;
  const result = tableResult(entry);
  const told = result === null ? lines : [...lines, result];
  return `${rollerWords(t, entry.roller)} · ${what}. ${told.join('. ')}`;
}

/**
 * What else a roll is (docs/adr/0044-online-play.md §4): its faces read off one's own dice, the
 * DM's word on them, and whether only the DM and one player see it — in the viewer's words; and a
 * check rolled again with Heroic Inspiration, the first no longer counting
 * (docs/adr/0046-reactions-beyond-counterspell.md §6).
 */
export function rollMarks(t: Translate, entry: RollEntry, isDm: boolean): string[] {
  const marks: string[] = [];
  if (entry.rerolled) marks.push(t('rolled again, does not count'));
  if (entry.rerollOf !== undefined) marks.push(t('Heroic Inspiration reroll'));
  if (entry.entered) {
    marks.push(entry.confirmed ? t('own dice, confirmed by the DM') : t('own dice'));
  }
  if (entry.private) marks.push(isDm ? t('only you and this player') : t('only you and the DM'));
  return marks;
}
