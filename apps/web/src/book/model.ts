import type {
  BookPlace,
  CampaignBook,
  CampaignBookChapter,
  CampaignBookPage,
} from '@ltw/contracts';

/**
 * The DM's book as the screen walks it (docs/adr/0074-dm-book.md §3): its leaves in order, where
 * the ribbon lies, which chapters are played, open or still ahead, and which picture a spread
 * shows. Pure: nothing here reads the world or changes it.
 */

/** One spread to read: a chapter's opening (its words to read aloud) or one of its pages. */
export interface Leaf {
  /** The chapter's key for an opening, the page's key for a page. */
  readonly key: string;
  readonly chapter: CampaignBookChapter;
  readonly page: CampaignBookPage | null;
  readonly index: number;
}

export function leavesOf(book: CampaignBook): Leaf[] {
  const leaves: Leaf[] = [];
  for (const chapter of book.chapters) {
    // A chapter with no words to read aloud opens straight on its first page.
    if (chapter.readAloud !== '' || chapter.goal !== '')
      leaves.push({ key: chapter.key, chapter, page: null, index: leaves.length });
    for (const page of chapter.pages)
      leaves.push({ key: page.key, chapter, page, index: leaves.length });
  }
  return leaves;
}

/** The leaf a key names, else the first: a ribbon left by an older book never strands the DM. */
export function leafAt(leaves: readonly Leaf[], key: string | null): Leaf | undefined {
  return leaves.find((leaf) => leaf.key === key) ?? leaves[0];
}

/**
 * The ribbon after the DM turned from one leaf to another (§3.4). It follows only the turn to
 * the next page from where it lies: reading ahead, turning back and opening a chapter from the
 * path leave it. Leaving a chapter by that turn marks the chapter played.
 */
export function placeAfterTurn(
  place: BookPlace,
  leaves: readonly Leaf[],
  from: Leaf,
  to: Leaf,
): BookPlace {
  const ribbon = leafAt(leaves, place.ribbon);
  if (!ribbon || ribbon.key !== from.key || to.index !== from.index + 1) return place;
  const left = to.chapter.key !== from.chapter.key ? [from.chapter.key] : [];
  return {
    ...place,
    ribbon: to.key,
    played: [...new Set([...place.played, ...left])],
  };
}

/** The ribbon laid on a leaf by the DM's hand: nothing is marked played by it. */
export const placeWithRibbon = (place: BookPlace, leaf: Leaf): BookPlace => ({
  ...place,
  ribbon: leaf.key,
});

export const placeWithChapter = (
  place: BookPlace,
  chapter: string,
  played: boolean,
): BookPlace => ({
  ...place,
  played: played
    ? [...new Set([...place.played, chapter])]
    : place.played.filter((key) => key !== chapter),
});

export const placeWithNote = (place: BookPlace, leaf: string, note: string): BookPlace => {
  const notes = Object.fromEntries(Object.entries(place.notes).filter(([key]) => key !== leaf));
  return { ...place, notes: note.trim() === '' ? notes : { ...notes, [leaf]: note } };
};

/**
 * A chapter on the path (§3.5). `here`: the ribbon lies in it. `played`: the DM left it by
 * turning its last page, or marked it. `next`: the first unplayed chapter after the ribbon in
 * the campaign's order. `open`: a clue the party has found in another chapter is about its place —
 * the reason is that clue. `later`: none of these. A state is a hint: every chapter can be opened.
 */
export type ChapterState = 'here' | 'played' | 'next' | 'open' | 'later';
export interface ChapterOnPath {
  readonly chapter: CampaignBookChapter;
  readonly state: ChapterState;
  /** The found clues that lead to this chapter's place, for `open`. */
  readonly clues: readonly string[];
}

export function pathOf(
  book: CampaignBook,
  place: BookPlace,
  foundClues: ReadonlySet<string>,
): ChapterOnPath[] {
  const leaves = leavesOf(book);
  const here = leafAt(leaves, place.ribbon)?.chapter.key;
  const played = new Set(place.played);
  const order = book.chapters.map((chapter) => chapter.key);
  const next = order.slice(order.indexOf(here ?? '') + 1).find((key) => !played.has(key));
  return book.chapters.map((chapter) => {
    const leading = book.clues
      .filter(
        (clue) =>
          foundClues.has(clue.key) &&
          clue.subjects.includes(chapter.place) &&
          !chapter.clues.includes(clue.key),
      )
      .map((clue) => clue.name);
    const state: ChapterState =
      chapter.key === here
        ? 'here'
        : played.has(chapter.key)
          ? 'played'
          : chapter.key === next
            ? 'next'
            : leading.length > 0
              ? 'open'
              : 'later';
    return { chapter, state, clues: state === 'open' ? leading : [] };
  });
}

/** What the right page's picture shows and how exactly (§3.3): the caption says which. */
export interface Plate {
  /** A package key of an entity whose picture is asked for. */
  readonly subject: string;
  readonly exactness: 'moment' | 'place' | 'chapter';
}

/**
 * The pictures to try for a spread, the most exact first: the open card's own subject (a person,
 * a fight's place), the page's own place, the chapter's place.
 */
export function platesFor(leaf: Leaf, moment: string | null): Plate[] {
  const plates: Plate[] = [];
  if (moment !== null) plates.push({ subject: moment, exactness: 'moment' });
  if (leaf.page?.place !== undefined && leaf.page.place !== leaf.chapter.place)
    plates.push({ subject: leaf.page.place, exactness: 'place' });
  plates.push({
    subject: leaf.chapter.place,
    exactness:
      leaf.page?.place === undefined || leaf.page.place === leaf.chapter.place
        ? 'place'
        : 'chapter',
  });
  return plates.filter(
    (plate, index) => plates.findIndex((p) => p.subject === plate.subject) === index,
  );
}

/** The minutes a chapter's pages are written for, and how many of them have a figure. */
export function minutesOf(chapter: CampaignBookChapter): number {
  return chapter.pages.reduce((sum, page) => sum + (page.minutes ?? 0), 0);
}

/**
 * A text cut into runs: plain words, and words that open something — a person of the cast or a
 * cue of a written page. Longer forms win over shorter ones that begin the same way.
 */
export interface TextRun {
  readonly text: string;
  readonly opens?: { readonly kind: 'person' | 'cue'; readonly key: string };
}

export function runsOf(page: CampaignBookPage, paragraph: string): TextRun[] {
  const targets = [
    ...(page.cues ?? []).flatMap((cue) =>
      cue.words.map((words) => ({ words, opens: { kind: 'cue' as const, key: cue.key } })),
    ),
    ...page.people.flatMap((link) =>
      link.words.map((words) => ({ words, opens: { kind: 'person' as const, key: link.person } })),
    ),
  ].sort((a, b) => b.words.length - a.words.length);
  const runs: TextRun[] = [];
  let rest = paragraph;
  const letter = /[\p{L}\p{N}]/u;
  while (rest !== '') {
    let best: { at: number; target: (typeof targets)[number] } | null = null;
    for (const target of targets) {
      let at = rest.indexOf(target.words);
      // A whole word only: «Руна» is not found inside «Рунами».
      while (
        at >= 0 &&
        (letter.test(rest.charAt(at - 1)) || letter.test(rest.charAt(at + target.words.length)))
      )
        at = rest.indexOf(target.words, at + 1);
      if (at >= 0 && (best === null || at < best.at)) best = { at, target };
    }
    if (best === null) break;
    if (best.at > 0) runs.push({ text: rest.slice(0, best.at) });
    runs.push({ text: best.target.words, opens: best.target.opens });
    rest = rest.slice(best.at + best.target.words.length);
  }
  if (rest !== '') runs.push({ text: rest });
  return runs;
}
