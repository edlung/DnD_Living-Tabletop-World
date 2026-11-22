import type { CampaignBook, CampaignBookCheck, PreparedEncounterView } from '@ltw/contracts';

import type { GlyphName } from '../visual/ui-kit-names.ts';
import type { Leaf } from './model.ts';

/** Something of a spread that opens as a card on the right page. */
export type Moment =
  | { readonly kind: 'person'; readonly key: string }
  | { readonly kind: 'clue'; readonly key: string }
  | { readonly kind: 'handout'; readonly key: string }
  | { readonly kind: 'encounter'; readonly key: string }
  | { readonly kind: 'puzzle' }
  | { readonly kind: 'cue'; readonly key: string };

export const momentId = (moment: Moment) =>
  'key' in moment ? `${moment.kind}:${moment.key}` : moment.kind;

/** The word for a kind of moment (an English key of the translations) and its glyph. */
export const MOMENT_KINDS: Readonly<
  Record<string, { readonly word: string; readonly glyph: GlyphName }>
> = {
  person: { word: 'Conversation', glyph: 'talk' },
  talk: { word: 'Conversation', glyph: 'talk' },
  check: { word: 'A roll', glyph: 'roll' },
  choice: { word: 'Fork', glyph: 'travel' },
  clue: { word: 'Find', glyph: 'evidence' },
  encounter: { word: 'Fight', glyph: 'encounter' },
  combat: { word: 'Fight', glyph: 'encounter' },
  path: { word: 'Road', glyph: 'map' },
  handout: { word: 'Handout', glyph: 'give' },
  puzzle: { word: 'Puzzle', glyph: 'key' },
};

export interface MomentLine {
  readonly moment: Moment;
  readonly name: string;
  readonly kind: string;
}

/** The moments of a spread, in the order the right page lists them. */
export function momentsOf(
  book: CampaignBook,
  leaf: Leaf,
  encounterTitle: (key: string) => string | null,
): MomentLine[] {
  const { chapter, page } = leaf;
  const lines: MomentLine[] = [];
  for (const cue of page?.cues ?? [])
    lines.push({ moment: { kind: 'cue', key: cue.key }, name: cue.title, kind: cue.kind });
  // On a page: the people its text names. On a chapter's opening: everyone the chapter names.
  const people = page ? page.people.map((link) => link.person) : chapter.people;
  const cued = new Set((page?.cues ?? []).flatMap((cue) => (cue.person ? [cue.person] : [])));
  for (const key of people) {
    const person = book.people.find((p) => p.key === key);
    if (person && !cued.has(key))
      lines.push({ moment: { kind: 'person', key }, name: person.name, kind: 'person' });
  }
  if (page?.cues) return lines;
  for (const key of chapter.encounters)
    lines.push({
      moment: { kind: 'encounter', key },
      name: encounterTitle(key) ?? key,
      kind: 'encounter',
    });
  if (chapter.puzzle)
    lines.push({ moment: { kind: 'puzzle' }, name: chapter.puzzle.prompt, kind: 'puzzle' });
  for (const key of chapter.clues) {
    const clue = book.clues.find((c) => c.key === key);
    if (clue) lines.push({ moment: { kind: 'clue', key }, name: clue.name, kind: 'clue' });
  }
  for (const key of chapter.handouts) {
    const handout = book.handouts.find((h) => h.key === key);
    if (handout)
      lines.push({ moment: { kind: 'handout', key }, name: handout.title, kind: 'handout' });
  }
  return lines;
}

const ABILITY: Readonly<Record<string, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};
const SKILL: Readonly<Record<string, string>> = {
  perception: 'Perception',
  investigation: 'Investigation',
  insight: 'Insight',
  survival: 'Survival',
  arcana: 'Arcana',
  stealth: 'Stealth',
  athletics: 'Athletics',
  acrobatics: 'Acrobatics',
  'sleight-of-hand': 'Sleight of Hand',
  history: 'History',
  nature: 'Nature',
  religion: 'Religion',
  'animal-handling': 'Animal Handling',
  medicine: 'Medicine',
  deception: 'Deception',
  intimidation: 'Intimidation',
  performance: 'Performance',
  persuasion: 'Persuasion',
};

/** A check's option in words: the English keys of its name and of its frame. */
export function optionWords(option: CampaignBookCheck['options'][number]): {
  readonly name: string;
  readonly frame: string;
} {
  const { check } = option;
  if (check.kind === 'skill')
    return { name: SKILL[check.skill] ?? check.skill, frame: '{name}, DC {dc}' };
  return {
    name: ABILITY[check.ability] ?? check.ability,
    frame: check.kind === 'save' ? '{name} saving throw, DC {dc}' : '{name}, DC {dc}',
  };
}

export const encounterOf = (
  encounters: readonly PreparedEncounterView[],
  id: string | undefined,
): PreparedEncounterView | null => encounters.find((e) => e.encounterId === id) ?? null;
