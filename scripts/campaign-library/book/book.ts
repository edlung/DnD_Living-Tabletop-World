import { existsSync, readdirSync, readFileSync } from 'node:fs';

import {
  CAMPAIGN_BOOK_VERSION,
  bookReferenceProblems,
  campaignBookSchema,
  type CampaignBook,
  type CampaignPackage,
} from '../../../packages/contracts/src/index.ts';

import { readCheckLine } from './check-line.ts';
import { tieEncounters } from './encounters.ts';
import { personFinder } from './people.ts';
import { voiceOf } from './voice.ts';

/**
 * A campaign's book from its source (docs/adr/0074-dm-book.md §2): every chapter and scene as
 * written, the check line also as fields, the people named in a page, the encounters tied to a
 * chapter. Nothing is written here that the source does not say. Both source shapes are read: the
 * family books (`act-N.json`, `props`, `end`) and the collections (`sessions-N.json`, `handouts`,
 * `ending`).
 */
interface SourceScene {
  title: string;
  minutes?: number;
  play: string;
  choices: string[];
  check: string;
  failForward: string;
  dmAftermath?: boolean;
}
interface SourceChapter {
  number: number;
  key: string;
  title: string;
  location: string;
  level?: number;
  duration?: string;
  participants: string[];
  clues: string[];
  goal: string;
  readAloud: string;
  scenes: SourceScene[];
  puzzle?: { prompt: string; solution: string; hints: string[] };
  spotlight?: string[];
  props?: string[];
  handouts?: string[];
  reward?: string[];
  end?: string;
  ending?: string;
  consequences: { if: string; then: string }[];
  rest?: string;
  dmNote: string;
}
interface SourceNpc {
  key: string;
  name: string;
  look: string;
  public: string;
  want: string;
  voice?: string;
  knows: string[];
  boundary?: string;
  secret?: string;
  reveal?: string;
  offer?: string;
  change?: string;
}
interface SourceClue {
  key: string;
  name: string;
  location?: string;
  appearance: string;
  statement: string;
  subjects?: string[];
  discovery?: string;
  method?: string;
  fallback?: string;
}
interface SourceHandout {
  key: string;
  title: string;
  text: string;
  unlock?: string;
  reveal?: number;
  task?: string;
}
interface SourceRoutes {
  decision: string;
  refusal: { choice: string; ending: string; followup?: { location: string; choice: string } };
  discovery: {
    choice: string;
    clues: string[];
    ending: string;
    chapter: number;
    inference: string;
    followup?: { location: string; choice: string };
  };
  defeat: {
    cost: string;
    ending: string;
    chapter: number;
    encounter: string;
    stakes: string;
    followup?: { location: string; choice: string };
  };
  chapters: { number: number; choice: string; result: string }[];
}

const filled = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== '')) as T;

export function bookOf(root: URL, pkg: CampaignPackage): CampaignBook {
  const source = new URL('source/', root);
  const read = (file: string): unknown => JSON.parse(readFileSync(new URL(file, source), 'utf8'));
  const maybe = (file: string): unknown =>
    existsSync(new URL(file, source)) ? read(file) : undefined;
  const chapters = readdirSync(source)
    .filter((file) => /^(?:act|sessions)-\d+\.json$/.test(file))
    .sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]))
    .flatMap((file) => read(file) as SourceChapter[])
    .sort((a, b) => a.number - b.number);
  const world = read('world.json') as { title: string; order?: string };
  const npcs = (read('cast.json') as { npcs: SourceNpc[] }).npcs;
  const clues = read('clues.json') as SourceClue[];
  const handouts = read('handouts.json') as SourceHandout[];
  const guide =
    (maybe('table-guide.json') as { session: number; title: string; text: string }[] | undefined) ??
    [];
  const routes = maybe('table-routes.json') as SourceRoutes | undefined;

  const places = new Set(pkg.entities.filter((e) => e.kind === 'location').map((e) => e.key));
  const known = new Set(pkg.entities.map((e) => e.key));
  const people = npcs.filter((npc) => known.has(npc.key));
  const peopleKeys = new Set(people.map((p) => p.key));
  const handoutKeys = new Set(handouts.map((h) => h.key));
  const clueKeys = new Set(clues.map((c) => c.key));
  const find = personFinder(
    people,
    chapters.flatMap((c) => [c.readAloud, ...c.scenes.map((s) => s.play)]).join('\n'),
  );
  const tied = tieEncounters(
    pkg.encounters,
    chapters.map((c) => ({
      key: c.key,
      number: c.number,
      location: c.location,
      text: c.scenes.map((s) => `${s.title} ${s.play} ${s.check}`).join(' '),
    })),
    routes && { chapter: routes.defeat.chapter, encounter: routes.defeat.encounter },
  );

  const book = campaignBookSchema.parse({
    schemaVersion: CAMPAIGN_BOOK_VERSION,
    title: world.title,
    ...filled({ order: world.order }),
    chapters: chapters.map((c) =>
      filled({
        key: c.key,
        number: c.number,
        title: c.title,
        place: c.location,
        goal: c.goal,
        readAloud: c.readAloud,
        dmNote: c.dmNote,
        duration: c.duration,
        level: c.level,
        people: c.participants.filter((key) => peopleKeys.has(key)),
        clues: c.clues.filter((key) => clueKeys.has(key)),
        handouts: (c.handouts ?? c.props ?? []).filter((key) => handoutKeys.has(key)),
        encounters: tied.byChapter.get(c.key) ?? [],
        pages: c.scenes.map((scene, index) =>
          filled({
            key: `${c.key}-scene-${String(index + 1)}`,
            title: scene.title,
            text: scene.play,
            voice: voiceOf(scene.play),
            layer: 1,
            minutes: scene.minutes,
            choices: scene.choices,
            check: readCheckLine(scene.check),
            failForward: scene.failForward,
            people: find(scene.play),
            aftermath: scene.dmAftermath === true ? true : undefined,
          }),
        ),
        puzzle: c.puzzle,
        spotlight: c.spotlight ?? [],
        reward: c.reward ?? [],
        ending: c.ending ?? c.end ?? '',
        consequences: c.consequences,
        rest: c.rest,
        guide: guide
          .filter((g) => g.session === c.number)
          .map((g) => ({ title: g.title, text: g.text })),
        detour: routes?.chapters
          .filter((r) => r.number === c.number)
          .map((r) => ({ choice: r.choice, result: r.result }))[0],
      }),
    ),
    people: people.map((p) =>
      filled({
        key: p.key,
        name: p.name,
        look: p.look,
        public: p.public,
        want: p.want,
        voice: p.voice,
        knows: p.knows,
        boundary: p.boundary,
        secret: p.secret,
        reveal: p.reveal,
        offer: p.offer,
        change: p.change,
      }),
    ),
    clues: clues
      .filter((clue) => pkg.clues.some((c) => c.key === clue.key))
      .map((clue) =>
        filled({
          key: clue.key,
          name: clue.name,
          place:
            clue.location !== undefined && places.has(clue.location) ? clue.location : undefined,
          appearance: clue.appearance,
          statement: clue.statement,
          subjects: (clue.subjects ?? []).filter((key) => known.has(key)),
          discovery: clue.discovery ?? clue.method ?? '',
          fallback: clue.fallback,
        }),
      ),
    handouts: handouts.map((h) =>
      filled({
        key: h.key,
        title: h.title,
        text: h.text,
        unlock: h.unlock,
        chapter: h.reveal,
        task: h.task,
      }),
    ),
    looseEncounters: tied.loose,
    ...(routes
      ? {
          routes: {
            decision: routes.decision,
            refusal: filled({ ...routes.refusal }),
            discovery: filled({
              ...routes.discovery,
              clues: routes.discovery.clues.filter((key) => clueKeys.has(key)),
            }),
            defeat: filled({ ...routes.defeat }),
          },
        }
      : {}),
  });
  requireBookFits(book, pkg);
  return book;
}

/** Throws unless everything the book names exists in this package (one of a campaign's variants). */
export function requireBookFits(book: CampaignBook, pkg: CampaignPackage): void {
  const problems = bookReferenceProblems(book, {
    places: new Set(pkg.entities.filter((e) => e.kind === 'location').map((e) => e.key)),
    people: new Set(pkg.entities.map((e) => e.key)),
    clues: new Set(pkg.clues.map((c) => c.key)),
    encounters: new Set(pkg.encounters.map((e) => e.key)),
  });
  if (problems.length > 0)
    throw new Error(
      `${book.title}: the book names what the package lacks: ${problems
        .slice(0, 8)
        .map((p) => `${p.path} → ${p.key}`)
        .join('; ')}`,
    );
}
