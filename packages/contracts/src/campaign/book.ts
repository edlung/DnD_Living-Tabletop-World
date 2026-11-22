import { z } from 'zod';

import { checkSchema } from '../dice/rolls.ts';
import { campaignKeySchema } from './story.ts';

/**
 * The DM's book of a campaign (docs/adr/0074-dm-book.md §2): the chapters and scenes its source
 * holds, in a shape the DM's screen can show. A document beside the campaign's packages, one a
 * campaign whatever the party's size; its keys are the package's local keys. It is the DM's text:
 * never part of a player's or the table screen's projection. Nothing here is a fact of the world
 * or a decision of the players — pages, checks, forks and the order of chapters are plans.
 */
export const CAMPAIGN_BOOK_VERSION = 1;

const text = z.string().trim().max(4000);
const longText = z.string().trim().max(16000);
const title = z.string().trim().min(1).max(200);
const words = z.string().trim().min(1).max(120);

/** Whom a page's text speaks to: the players (read it aloud) or the DM (retell it). */
export const BOOK_VOICES = ['players', 'dm'] as const;
export type BookVoice = (typeof BOOK_VOICES)[number];

/**
 * A scene's check. `line` is the campaign's own sentence and is always kept. `roll` says what
 * could be read from it with certainty: `asked` with the options it names, `none` when it says
 * there is no roll, `unread` when neither can be told — then only the line is shown.
 */
export const BOOK_ROLLS = ['asked', 'none', 'unread'] as const;
export const campaignBookCheckSchema = z
  .object({
    line: text,
    roll: z.enum(BOOK_ROLLS),
    options: z
      .array(
        z
          .object({
            check: checkSchema,
            dc: z.number().int().min(1).max(40),
            /** The line asks the whole party at once («группой»). */
            group: z.literal(true).exactOptional(),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export type CampaignBookCheck = z.infer<typeof campaignBookCheckSchema>;

/** Words in a page's text that name someone of the cast, in the forms the text uses. */
const personLinkSchema = z
  .object({ person: campaignKeySchema, words: z.array(words).min(1).max(16) })
  .strict();

/** The kinds of moment a written page can point at (the second layer and the built-in adventures). */
export const BOOK_CUE_KINDS = [
  'talk',
  'check',
  'choice',
  'clue',
  'combat',
  'path',
  'handout',
  'puzzle',
] as const;
export const campaignBookCueSchema = z
  .object({
    key: campaignKeySchema,
    kind: z.enum(BOOK_CUE_KINDS),
    title,
    /** The words of the page's text this moment is opened from. */
    words: z.array(words).max(8),
    brief: text,
    details: z.array(z.object({ label: title, text }).strict()).max(12),
    person: campaignKeySchema.exactOptional(),
    clue: campaignKeySchema.exactOptional(),
    encounter: campaignKeySchema.exactOptional(),
    check: campaignBookCheckSchema.exactOptional(),
  })
  .strict();

export const campaignBookPageSchema = z
  .object({
    key: campaignKeySchema,
    title,
    /** Where this page plays, when it is not the chapter's own place. */
    place: campaignKeySchema.exactOptional(),
    /** The scene as the campaign wrote it; paragraphs are separated by an empty line. */
    text: longText,
    voice: z.enum(BOOK_VOICES),
    /** 1: the campaign's own source text. 2: narration written for the book. */
    layer: z.union([z.literal(1), z.literal(2)]),
    minutes: z.number().int().min(0).max(600).exactOptional(),
    choices: z.array(text).max(20),
    check: campaignBookCheckSchema,
    failForward: text,
    people: z.array(personLinkSchema).max(32),
    /** A scene the source marks as the DM's own aftermath notes, not a scene to play. */
    aftermath: z.literal(true).exactOptional(),
    /** A question to put to the table, where a written page has one. */
    question: text.exactOptional(),
    note: text.exactOptional(),
    cues: z.array(campaignBookCueSchema).max(16).exactOptional(),
  })
  .strict();
export type CampaignBookPage = z.infer<typeof campaignBookPageSchema>;

export const campaignBookChapterSchema = z
  .object({
    key: campaignKeySchema,
    number: z.number().int().min(0).max(200),
    title,
    /** The place the chapter plays at: a location of the package. */
    place: campaignKeySchema,
    goal: text,
    readAloud: text,
    dmNote: text,
    duration: text.exactOptional(),
    level: z.number().int().min(1).max(20).exactOptional(),
    people: z.array(campaignKeySchema).max(32),
    clues: z.array(campaignKeySchema).max(32),
    handouts: z.array(campaignKeySchema).max(32),
    /** Prepared encounters tied to this chapter with certainty (ADR 0074 §2.5). */
    encounters: z.array(campaignKeySchema).max(16),
    pages: z.array(campaignBookPageSchema).min(1).max(40),
    puzzle: z
      .object({ prompt: text, solution: text, hints: z.array(text).max(12) })
      .strict()
      .exactOptional(),
    spotlight: z.array(text).max(20),
    reward: z.array(text).max(20),
    ending: text,
    consequences: z.array(z.object({ if: text, then: text }).strict()).max(20),
    rest: text.exactOptional(),
    /** The campaign's notes for the DM on this evening (`source/table-guide.json`). */
    guide: z.array(z.object({ title, text: longText }).strict()).max(8),
    /** What the campaign says if the party changed the plan here (`source/table-routes.json`). */
    detour: z.object({ choice: text, result: text }).strict().exactOptional(),
  })
  .strict();
export type CampaignBookChapter = z.infer<typeof campaignBookChapterSchema>;

/** Someone of the cast as the DM reads them. `secret` and `reveal` are the DM's alone. */
export const campaignBookPersonSchema = z
  .object({
    key: campaignKeySchema,
    name: title,
    look: text,
    public: text,
    want: text,
    voice: text.exactOptional(),
    knows: z.array(text).max(20),
    boundary: text.exactOptional(),
    secret: text.exactOptional(),
    reveal: text.exactOptional(),
    offer: text.exactOptional(),
    change: text.exactOptional(),
  })
  .strict();

export const campaignBookClueSchema = z
  .object({
    key: campaignKeySchema,
    name: title,
    place: campaignKeySchema.exactOptional(),
    appearance: text,
    statement: text,
    /** What the clue is about: people and places of the package. A place here is where it leads. */
    subjects: z.array(campaignKeySchema).max(16),
    /** How it is found, and the way to it that needs no luck. */
    discovery: text,
    fallback: text.exactOptional(),
  })
  .strict();

export const campaignBookHandoutSchema = z
  .object({
    key: campaignKeySchema,
    title,
    text: longText,
    /** When it is given, in the campaign's words. */
    unlock: text.exactOptional(),
    /** The chapter it appears in, where the source names one. */
    chapter: z.number().int().min(0).max(200).exactOptional(),
    task: text.exactOptional(),
  })
  .strict();

const followup = z.object({ location: campaignKeySchema, choice: text }).strict();
/** The campaign's own notes on a party that leaves the prepared road (`source/table-routes.json`). */
export const campaignBookRoutesSchema = z
  .object({
    decision: text,
    refusal: z.object({ choice: text, ending: text, followup: followup.exactOptional() }).strict(),
    discovery: z
      .object({
        choice: text,
        clues: z.array(campaignKeySchema).max(16),
        ending: text,
        chapter: z.number().int().min(0).max(200),
        inference: text,
        followup: followup.exactOptional(),
      })
      .strict(),
    defeat: z
      .object({
        cost: text,
        ending: text,
        chapter: z.number().int().min(0).max(200),
        encounter: campaignKeySchema,
        stakes: text,
        followup: followup.exactOptional(),
      })
      .strict(),
  })
  .strict();

export const campaignBookSchema = z
  .object({
    schemaVersion: z.literal(CAMPAIGN_BOOK_VERSION),
    title,
    /**
     * A book whose text was written for it and has not been read by the owner yet (the built-in
     * adventures, the second layer): the server keeps it closed until this is gone.
     */
    awaitingReading: z.literal(true).exactOptional(),
    /** The campaign's sentence about the order of its chapters, where it has one. */
    order: text.exactOptional(),
    chapters: z.array(campaignBookChapterSchema).min(1).max(40),
    people: z.array(campaignBookPersonSchema).max(200),
    clues: z.array(campaignBookClueSchema).max(500),
    handouts: z.array(campaignBookHandoutSchema).max(200),
    /** Prepared encounters no chapter could be named for with certainty. */
    looseEncounters: z.array(campaignKeySchema).max(100),
    routes: campaignBookRoutesSchema.exactOptional(),
  })
  .strict();
export type CampaignBook = z.infer<typeof campaignBookSchema>;

/** A reference of a book that points at nothing: where it is and what it names. */
export interface BookReferenceProblem {
  readonly path: string;
  readonly key: string;
}

/**
 * Every key a book names against what exists: `places`, `people`, `clues` and `encounters` are the
 * keys of the package (or the seed) the book belongs to (`people` holds every entity: a clue's
 * subject may be a place or a thing). People, clues and handouts a chapter or a
 * page names must also have their entry in the book itself.
 */
export function bookReferenceProblems(
  book: CampaignBook,
  world: {
    readonly places: ReadonlySet<string>;
    readonly people: ReadonlySet<string>;
    readonly clues: ReadonlySet<string>;
    readonly encounters: ReadonlySet<string>;
  },
): BookReferenceProblem[] {
  const problems: BookReferenceProblem[] = [];
  const need = (set: ReadonlySet<string>, key: string | undefined, path: string) => {
    if (key !== undefined && !set.has(key)) problems.push({ path, key });
  };
  const own = {
    people: new Set(book.people.map((p) => p.key)),
    clues: new Set(book.clues.map((c) => c.key)),
    handouts: new Set(book.handouts.map((h) => h.key)),
  };
  const seen = new Set<string>();
  const unique = (key: string, path: string) => {
    if (seen.has(key)) problems.push({ path, key });
    seen.add(key);
  };
  for (const person of book.people) need(world.people, person.key, `people.${person.key}`);
  for (const clue of book.clues) {
    need(world.clues, clue.key, `clues.${clue.key}`);
    need(world.places, clue.place, `clues.${clue.key}.place`);
    for (const key of clue.subjects) need(world.people, key, `clues.${clue.key}.subjects`);
  }
  for (const key of book.looseEncounters) need(world.encounters, key, 'looseEncounters');
  if (book.routes) {
    for (const key of book.routes.discovery.clues) need(own.clues, key, 'routes.discovery.clues');
    need(world.encounters, book.routes.defeat.encounter, 'routes.defeat.encounter');
    for (const part of ['refusal', 'discovery', 'defeat'] as const)
      need(world.places, book.routes[part].followup?.location, `routes.${part}.followup`);
  }
  for (const chapter of book.chapters) {
    const at = `chapters.${chapter.key}`;
    unique(chapter.key, at);
    need(world.places, chapter.place, `${at}.place`);
    for (const key of chapter.people) need(world.people, key, `${at}.people`);
    for (const key of chapter.clues) need(own.clues, key, `${at}.clues`);
    for (const key of chapter.handouts) need(own.handouts, key, `${at}.handouts`);
    for (const key of chapter.encounters) need(world.encounters, key, `${at}.encounters`);
    for (const page of chapter.pages) {
      const on = `${at}.pages.${page.key}`;
      unique(page.key, on);
      need(world.places, page.place, `${on}.place`);
      for (const link of page.people) {
        need(own.people, link.person, `${on}.people`);
        for (const form of link.words)
          if (!page.text.includes(form)) problems.push({ path: `${on}.people.words`, key: form });
      }
      for (const cue of page.cues ?? []) {
        need(own.people, cue.person, `${on}.cues.${cue.key}.person`);
        need(own.clues, cue.clue, `${on}.cues.${cue.key}.clue`);
        need(world.encounters, cue.encounter, `${on}.cues.${cue.key}.encounter`);
        for (const form of cue.words)
          if (!page.text.includes(form))
            problems.push({ path: `${on}.cues.${cue.key}.words`, key: form });
      }
    }
  }
  return problems;
}
