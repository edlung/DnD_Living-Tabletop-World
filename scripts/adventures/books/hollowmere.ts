import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import {
  CAMPAIGN_BOOK_VERSION,
  campaignBookSchema,
  type CampaignBook,
  type Skill,
} from '../../../packages/contracts/src/index.ts';
import { readSeed } from './seed.ts';

/**
 * The Bells of Hollowmere as a book (docs/adr/0074-dm-book.md §2.8): the eight spreads of the
 * concept in `docs/design/dm-book/story.js`, as written there, put under the adventure's four
 * chapters. The chapters' titles, decisions and consequences are the table of
 * `docs/BUILTIN_ADVENTURES_DM_RU.md`. The tables below only say which seed ID a spread's short
 * name means; no sentence is written here.
 */
const ROOT = new URL('../../../', import.meta.url);
const PLACE: Readonly<Record<string, string>> = {
  gate: 'north-gate',
  ford: 'willow-ford',
  hall: 'reeves-hall',
  tower: 'bell-tower',
  chapel: 'drowned-chapel',
  mill: 'sunken-mill',
  chamber: 'location-c81f04da',
  village: 'hollowmere',
};
const PERSON: Readonly<Record<string, string>> = {
  offer: 'agna-brisk',
  host: 'hobb-fenwick',
  witness: 'sister-ilse',
  parley: 'kerra-reed',
  captive: 'old-matthis',
  account: 'sister-ilse',
};
const ENCOUNTER: Readonly<Record<string, string>> = {
  ambush: 'willow-ford-ambush',
  cellar: 'cellar-rats',
  nave: 'drowned-chapel',
  crew: 'sunken-mill',
  guard: 'sunken-bell',
};
const CLUE: Readonly<Record<string, string>> = {
  prints: 'clue-ford-tracks',
  knot: 'clue-rope-verdigris',
  slab: 'clue-slab-stair',
  ledger: 'clue-ledger',
};
const SKILL: Readonly<Record<string, Skill>> = {
  Восприятие: 'perception',
  Расследование: 'investigation',
};

interface Cue {
  kind: 'talk' | 'check' | 'choice' | 'clue' | 'combat' | 'path';
  title: string;
  brief: string;
  details?: [string, string][];
  route?: [string, string];
  test?: string;
  dc?: number;
  outcomes?: [string, string];
}
interface Spread {
  id: string;
  chapter: number;
  place: string;
  title: string;
  paragraphs: string[];
  question: string;
  guide: [string, string];
  cues: Record<string, Cue>;
}

function spreads(): Spread[] {
  const code = readFileSync(new URL('docs/design/dm-book/story.js', ROOT), 'utf8');
  const page: { dmStory?: Spread[] } = {};
  // The concept's data is a browser script that assigns one array to `window`.
  runInNewContext(code, { window: page });
  if (!page.dmStory) throw new Error('docs/design/dm-book/story.js: no dmStory');
  return page.dmStory;
}

/** The rows «N. Title | decision | consequence» of the Hollowmere table in the DM's notes. */
function chapterRows(): { title: string; goal: string; dmNote: string }[] {
  const notes = readFileSync(new URL('docs/BUILTIN_ADVENTURES_DM_RU.md', ROOT), 'utf8');
  return [...notes.matchAll(/^\|\s*\d+\.\s+([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gmu)].map(
    (row) => ({ title: row[1] ?? '', goal: row[2] ?? '', dmNote: row[3] ?? '' }),
  );
}

const ANCHOR = /\[([a-z]+)\|([^\]]+)\]/gu;

export function hollowmereBook(): CampaignBook {
  const seed = readSeed(new URL('fixtures/hollowmere-ru/', ROOT));
  const rows = chapterRows();
  const all = spreads();
  const chapters = rows.map((row, index) => {
    const own = all.filter((spread) => spread.chapter === index);
    const first = own[0];
    if (!first) throw new Error(`Hollowmere chapter ${String(index + 1)}: no spreads`);
    const cueKeys = own.flatMap((spread) => Object.keys(spread.cues));
    const mapped = (table: Readonly<Record<string, string>>) => [
      ...new Set(cueKeys.flatMap((key) => table[key] ?? [])),
    ];
    return {
      key: `hollowmere-${String(index + 1)}`,
      number: index + 1,
      title: row.title,
      place: PLACE[first.place] ?? '',
      goal: row.goal,
      readAloud: '',
      dmNote: row.dmNote,
      people: mapped(PERSON),
      clues: mapped(CLUE),
      handouts: [],
      encounters: mapped(ENCOUNTER),
      spotlight: [],
      reward: [],
      ending: '',
      consequences: [],
      guide: [],
      pages: own.map((spread) => {
        const anchors = new Map<string, string[]>();
        for (const paragraph of spread.paragraphs)
          for (const match of paragraph.matchAll(ANCHOR))
            anchors.set(match[1] ?? '', [...(anchors.get(match[1] ?? '') ?? []), match[2] ?? '']);
        return {
          key: `hollowmere-${spread.id}`,
          title: spread.title,
          place: PLACE[spread.place] ?? '',
          text: spread.paragraphs.map((p) => p.replace(ANCHOR, '$2')).join('\n\n'),
          voice: 'players' as const,
          layer: 2 as const,
          choices: [],
          check: { line: '', roll: 'none' as const, options: [] },
          failForward: '',
          people: [],
          question: spread.question,
          note: `${spread.guide[0]}. ${spread.guide[1]}`,
          cues: Object.entries(spread.cues).map(([key, cue]) => {
            const skill = SKILL[cue.test?.split('·')[1]?.trim() ?? ''];
            return {
              key: `hollowmere-${spread.id}-${key}`,
              kind: cue.kind,
              title: cue.title,
              words: anchors.get(key) ?? [],
              brief: cue.brief,
              details: [
                ...(cue.outcomes
                  ? [
                      { label: 'Успех', text: cue.outcomes[0] },
                      { label: 'Неудача', text: cue.outcomes[1] },
                    ]
                  : []),
                ...(cue.details ?? []).map(([label, text]) => ({ label, text })),
                ...(cue.route ? [{ label: 'Куда дальше', text: cue.route[1] }] : []),
              ],
              ...(PERSON[key] ? { person: PERSON[key] } : {}),
              ...(CLUE[key] ? { clue: CLUE[key] } : {}),
              ...(ENCOUNTER[key] ? { encounter: ENCOUNTER[key] } : {}),
              ...(cue.test !== undefined && cue.dc !== undefined
                ? {
                    check: {
                      line: `${cue.test}, СЛ ${String(cue.dc)}`,
                      roll: skill ? ('asked' as const) : ('unread' as const),
                      options: skill
                        ? [{ check: { kind: 'skill' as const, skill }, dc: cue.dc }]
                        : [],
                    },
                  }
                : {}),
            };
          }),
        };
      }),
    };
  });
  return campaignBookSchema.parse({
    schemaVersion: CAMPAIGN_BOOK_VERSION,
    title: 'Холлоумир: колокола в тумане',
    awaitingReading: true,
    chapters,
    people: seed.people,
    clues: seed.clueCards,
    handouts: [],
    looseEncounters: [...seed.encounters].filter(
      (key) => !chapters.some((chapter) => chapter.encounters.includes(key)),
    ),
  });
}
