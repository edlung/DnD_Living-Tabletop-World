import {
  CAMPAIGN_BOOK_VERSION,
  campaignBookSchema,
  type CampaignBook,
  type CampaignPackage,
} from '@ltw/contracts';
import type { WorldState } from '@ltw/domain';

/**
 * A book from the world itself (docs/adr/0075-book-interface.md §5): a campaign no book was written
 * for — one published from the workshop, a package edited before it was published, a built-in
 * adventure whose written pages still wait for the owner's reading — opens as a book assembled from
 * what it already holds. Nothing is written for it and no model is asked: every phrase is the
 * campaign's own (layer 1), and what it does not hold — a scene's check, a person's wants, a
 * handout — stays empty for the book to show as a gap (ADR 0074 §1.6). Its pages are the DM's to
 * tell in their own words: only the campaign's opening is marked to be read aloud.
 */
type Chapter = CampaignBook['chapters'][number];
type Person = CampaignBook['people'][number];
type BookClue = CampaignBook['clues'][number];

const KEY = /^[a-z][a-z0-9-]{0,47}$/u;
const isKey = (value: string) => KEY.test(value);
const cut = (value: string, max = 4000) => value.trim().slice(0, max).trim();
const MAX_CHAPTERS = 40;

/** A page's key beside its chapter's: stable while the chapter is, unique in the book. */
function pageKeyOf(chapter: string, taken: Set<string>): string {
  const base = `${chapter.slice(0, 40)}-scene`;
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${chapter.slice(0, 36)}-scene-${String(n)}`;
  taken.add(key);
  return key;
}

/** Who a page names in its own words: the person's full name, or the first word of it. */
function linksIn(text: string, people: readonly { key: string; name: string }[]) {
  return people.flatMap(({ key, name }) => {
    const first = name.split(/\s+/u)[0] ?? '';
    const words = [...new Set([name, first])].filter((w) => w.length > 1 && text.includes(w));
    return words.length > 0 ? [{ person: key, words: words.map((w) => cut(w, 120)) }] : [];
  });
}

interface Scene {
  readonly key: string;
  readonly title: string;
  readonly place: string;
  readonly goal: string;
  readonly readAloud: string;
  readonly text: string;
  readonly choices: readonly string[];
  readonly consequences: readonly { readonly if: string; readonly then: string }[];
  readonly people: readonly { key: string; name: string }[];
  readonly clues: readonly string[];
  readonly encounters: readonly string[];
}

function chapterOf(scene: Scene, number: number, taken: Set<string>): Chapter {
  const text = cut(scene.text, 16000);
  return {
    key: scene.key,
    number,
    title: cut(scene.title, 200),
    place: scene.place,
    goal: cut(scene.goal),
    readAloud: cut(scene.readAloud),
    dmNote: '',
    people: scene.people.map((person) => person.key).slice(0, 32),
    clues: scene.clues.slice(0, 32),
    handouts: [],
    encounters: scene.encounters.slice(0, 16),
    pages: [
      {
        key: pageKeyOf(scene.key, taken),
        title: cut(scene.title, 200),
        text,
        voice: 'dm',
        layer: 1,
        choices: scene.choices.slice(0, 20).map((choice) => cut(choice)),
        check: { line: '', roll: 'unread', options: [] },
        failForward: '',
        people: linksIn(text, scene.people).slice(0, 32),
      },
    ],
    spotlight: [],
    reward: [],
    ending: '',
    consequences: scene.consequences.slice(0, 20).map((step) => ({
      if: cut(step.if),
      then: cut(step.then),
    })),
    guide: [],
  };
}

function bound(
  title: string,
  chapters: Chapter[],
  people: Person[],
  clues: BookClue[],
  loose: string[],
): CampaignBook | null {
  if (chapters.length === 0) return null;
  const parsed = campaignBookSchema.safeParse({
    schemaVersion: CAMPAIGN_BOOK_VERSION,
    title: cut(title, 200),
    assembled: true,
    chapters,
    people: people.slice(0, 200),
    clues: clues.slice(0, 500),
    handouts: [],
    looseEncounters: loose.slice(0, 100),
  });
  return parsed.success ? parsed.data : null;
}

const personOf = (key: string, name: string, look: string): Person => ({
  key,
  name: cut(name, 200),
  look: cut(look),
  public: '',
  want: '',
  knows: [],
});

/**
 * The book of a package (a published campaign's revision): a chapter a situation at a place of
 * the package, in the package's order; the first chapter opens with the campaign's opening words.
 */
export function bookFromPackage(content: CampaignPackage): CampaignBook | null {
  const entities = new Map(content.entities.map((entity) => [entity.key, entity]));
  const places = new Set(
    content.entities.filter((entity) => entity.kind === 'location').map((entity) => entity.key),
  );
  const npcs = content.entities.filter((entity) => entity.kind === 'npc');
  const npcKeys = new Set(npcs.map((npc) => npc.key));
  const clueKeys = new Set(content.clues.map((clue) => clue.key));
  const opening = cut(content.world.opening) || cut(content.firstSession.join('\n\n'));
  const tied = new Set<string>();
  const taken = new Set<string>();
  const situations = content.situations
    .filter((situation) => places.has(situation.location))
    .slice(0, MAX_CHAPTERS);
  const chapters = situations.map((situation, index) => {
    const encounters = content.encounters
      .filter((encounter) => encounter.location === situation.location && !tied.has(encounter.key))
      .map((encounter) => encounter.key)
      .slice(0, 16);
    for (const key of encounters) tied.add(key);
    return chapterOf(
      {
        key: situation.key,
        title: situation.title,
        place: situation.location,
        goal: situation.hooks[0] ?? '',
        // Only the campaign's opening is written for the players' ears: a situation's words are
        // the DM's, and may hold what the party has not learned — told, never read aloud.
        readAloud: index === 0 ? opening : '',
        text: situation.description,
        choices: situation.approaches,
        consequences: situation.developments,
        people: situation.participants
          .filter((key) => npcKeys.has(key))
          .map((key) => ({ key, name: entities.get(key)?.name ?? key })),
        clues: situation.clueKeys.filter((key) => clueKeys.has(key)),
        encounters,
      },
      index + 1,
      taken,
    );
  });
  const placeOf = (key: string) => entities.get(key)?.placement?.location;
  const clues = content.clues.map((clue): BookClue => {
    const entity = entities.get(clue.entity);
    const place = entity?.kind === 'location' ? entity.key : placeOf(clue.entity);
    return {
      key: clue.key,
      name: cut(entity?.name ?? clue.key, 200),
      ...(place !== undefined && places.has(place) ? { place } : {}),
      appearance: cut(entity?.description ?? ''),
      statement: cut(clue.statement),
      subjects: clue.subjects.filter((key) => entities.has(key)).slice(0, 16),
      discovery: '',
    };
  });
  return bound(
    content.world.name,
    chapters,
    npcs.map((npc) => personOf(npc.key, npc.name, npc.description)),
    clues,
    content.encounters.filter((e) => !tied.has(e.key)).map((e) => e.key),
  );
}

/**
 * The book of a world with no package behind it (a built-in adventure): a chapter a place, the
 * party's own first; its page is the place as the world describes it, with who is there and the
 * clues that lie there. The keys are the world's own IDs, as a built-in adventure's book's are.
 */
export function bookFromWorld(state: WorldState): CampaignBook | null {
  if (!state.campaign) return null;
  const all = [...state.entities.values()].filter(
    (entity) => entity.status !== 'destroyed' && isKey(entity.entityId),
  );
  const start = state.activeSceneId ? state.scenes.get(state.activeSceneId)?.locationId : undefined;
  const places = all
    .filter((entity) => entity.kind === 'location' && entity.location?.type !== 'region')
    .sort((a, b) => Number(b.entityId === start) - Number(a.entityId === start))
    .slice(0, MAX_CHAPTERS);
  const placeKeys = new Set(places.map((place) => place.entityId));
  const at = (location: string) =>
    all.filter((entity) => entity.placement?.locationId === location);
  const clues = [...state.investigation.clues.values()].filter((clue) => isKey(clue.clueId));
  const whereIs = (entityId: string) => {
    const entity = state.entities.get(entityId);
    return entity?.kind === 'location' ? entityId : entity?.placement?.locationId;
  };
  const taken = new Set<string>();
  const chapters = places.map((place, index) =>
    chapterOf(
      {
        key: place.entityId,
        title: place.name,
        place: place.entityId,
        goal: '',
        readAloud: '',
        text: place.description,
        choices: [],
        consequences: [],
        people: at(place.entityId)
          .filter((entity) => entity.kind === 'npc')
          .map((npc) => ({ key: npc.entityId, name: npc.name })),
        clues: clues
          .filter((clue) => whereIs(clue.entityId) === place.entityId)
          .map((clue) => clue.clueId),
        encounters: [],
      },
      index + 1,
      taken,
    ),
  );
  const people = all
    .filter((entity) => entity.kind === 'npc')
    .map((npc) => personOf(npc.entityId, npc.name, npc.description));
  const bookClues = clues.flatMap((clue): BookClue[] => {
    const entity = state.entities.get(clue.entityId);
    if (!entity || !isKey(entity.entityId)) return [];
    const place = whereIs(clue.entityId);
    return [
      {
        key: clue.clueId,
        name: cut(entity.name, 200),
        ...(place !== undefined && placeKeys.has(place) ? { place } : {}),
        appearance: cut(entity.description),
        statement: cut(clue.statement),
        subjects: clue.subjects.filter((key) => isKey(key) && state.entities.has(key)).slice(0, 16),
        discovery: '',
      },
    ];
  });
  return bound(state.campaign.name, chapters, people, bookClues, []);
}
