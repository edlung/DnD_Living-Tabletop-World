import { describe, expect, it } from 'vitest';

import { bookReferenceProblems, campaignBookSchema, type CampaignBook } from './book.ts';

const page = {
  key: 'dock-scene-1',
  title: 'Причал',
  text: 'Марфа ждёт у причала.',
  voice: 'dm',
  layer: 1,
  choices: ['Спросить Марфу'],
  check: {
    line: 'Убеждение СЛ 12',
    roll: 'asked',
    options: [{ check: { kind: 'skill', skill: 'persuasion' }, dc: 12 }],
  },
  failForward: 'Марфа всё равно показывает дорогу.',
  people: [{ person: 'marfa', words: ['Марфа'] }],
} as const;
interface Draft {
  schemaVersion: number;
  title: string;
  chapters: (Record<string, unknown> & { pages: unknown[] })[];
  people: unknown[];
  clues: unknown[];
  handouts: unknown[];
  looseEncounters: string[];
  secret?: string;
  awaitingReading?: boolean;
}
const book = (change: (draft: Draft) => void = () => undefined) => {
  const draft: Draft = {
    schemaVersion: 1,
    title: 'Маяк',
    chapters: [
      {
        key: 'dock',
        number: 1,
        title: 'Причал',
        place: 'pier',
        goal: 'Найти дорогу.',
        readAloud: 'Над причалом гаснут фонари.',
        dmNote: '',
        people: ['marfa'],
        clues: ['ticket'],
        handouts: ['letter'],
        encounters: ['keepers'],
        pages: [page],
        spotlight: [],
        reward: [],
        ending: '',
        consequences: [],
        guide: [],
      },
    ],
    people: [{ key: 'marfa', name: 'Марфа', look: '', public: '', want: '', knows: [] }],
    clues: [
      {
        key: 'ticket',
        name: 'Билет',
        appearance: '',
        statement: 'Билет на сегодня.',
        subjects: ['pier'],
        discovery: '',
      },
    ],
    handouts: [{ key: 'letter', title: 'Письмо', text: 'Приходите к полуночи.' }],
    looseEncounters: [],
  };
  change(draft);
  return draft;
};
const world = {
  places: new Set(['pier']),
  people: new Set(['marfa', 'pier']),
  clues: new Set(['ticket']),
  encounters: new Set(['keepers']),
};
const parsed = (change?: (draft: Draft) => void): CampaignBook =>
  campaignBookSchema.parse(book(change));

describe('the DM book of a campaign', () => {
  it('accepts a book built from a source and keeps it as given', () => {
    expect(parsed()).toEqual(book());
    expect(bookReferenceProblems(parsed(), world)).toEqual([]);
  });

  it('refuses what is not in the contract', () => {
    expect(campaignBookSchema.safeParse(book((d) => (d.schemaVersion = 2))).success).toBe(false);
    expect(campaignBookSchema.safeParse(book((d) => (d.chapters = []))).success).toBe(false);
    expect(campaignBookSchema.safeParse(book((d) => (d.secret = 'x'))).success).toBe(false);
    expect(campaignBookSchema.safeParse(book((d) => (d.awaitingReading = false))).success).toBe(
      false,
    );
    const withPage = (change: Record<string, unknown>) =>
      book((d) => {
        const chapters = d.chapters;
        if (chapters[0]) chapters[0].pages = [{ ...page, ...change }];
      });
    expect(campaignBookSchema.safeParse(withPage({ voice: 'everyone' })).success).toBe(false);
    expect(campaignBookSchema.safeParse(withPage({ layer: 3 })).success).toBe(false);
    expect(campaignBookSchema.safeParse(withPage({ text: 'я'.repeat(16001) })).success).toBe(false);
    expect(
      campaignBookSchema.safeParse(
        withPage({
          check: {
            line: '',
            roll: 'asked',
            options: [{ check: { kind: 'skill', skill: 'cooking' }, dc: 12 }],
          },
        }),
      ).success,
    ).toBe(false);
    expect(
      campaignBookSchema.safeParse(
        withPage({
          check: {
            line: '',
            roll: 'asked',
            options: [{ check: { kind: 'ability', ability: 'str' }, dc: 41 }],
          },
        }),
      ).success,
    ).toBe(false);
  });

  it('keeps a scene’s words to read aloud and the DM’s pocket, within their bounds', () => {
    const pocket = {
      rumours: [{ text: '«Маяк гудит к шторму».', truth: 'partial', note: 'Гудит ветер в трубе.' }],
      places: [{ name: 'Скамья у сетей', text: 'Здесь чинят сети и спорят о погоде.' }],
      people: [
        {
          name: 'Ульяна',
          look: 'Рыбачка в зюйдвестке.',
          line: '«Шторм к ночи».',
          knows: 'Кто ушёл в море.',
        },
      ],
    };
    const told = parsed((d) => {
      (d as Draft & { pocket?: unknown }).pocket = pocket;
      if (d.chapters[0])
        d.chapters[0].pages = [{ ...page, readAloud: 'Ветер гонит пену по доскам.' }];
    });
    expect(told.pocket).toEqual(pocket);
    expect(told.chapters[0]?.pages[0]?.readAloud).toBe('Ветер гонит пену по доскам.');
    const withPocket = (change: (p: typeof pocket) => unknown) =>
      book((d) => ((d as Draft & { pocket?: unknown }).pocket = change(structuredClone(pocket))));
    expect(
      campaignBookSchema.safeParse(
        withPocket((p) => ({ ...p, rumours: [{ ...p.rumours[0], truth: 'maybe' }] })),
      ).success,
    ).toBe(false);
    expect(
      campaignBookSchema.safeParse(
        withPocket((p) => ({ ...p, places: Array(9).fill(p.places[0]) })),
      ).success,
    ).toBe(false);
    expect(campaignBookSchema.safeParse(withPocket((p) => ({ ...p, secret: 'x' }))).success).toBe(
      false,
    );
    expect(bookReferenceProblems(told, world)).toEqual([]);
  });

  it('names every key that points at nothing', () => {
    const empty = {
      places: new Set<string>(),
      people: new Set<string>(),
      clues: new Set<string>(),
      encounters: new Set<string>(),
    };
    expect(bookReferenceProblems(parsed(), empty).map((p) => `${p.path} → ${p.key}`)).toEqual([
      'people.marfa → marfa',
      'clues.ticket → ticket',
      'clues.ticket.subjects → pier',
      'chapters.dock.place → pier',
      'chapters.dock.people → marfa',
      'chapters.dock.encounters → keepers',
    ]);
    const stray = parsed((d) => {
      d.people = [];
      d.clues = [];
      d.handouts = [];
      d.looseEncounters = ['nobody'];
    });
    expect(bookReferenceProblems(stray, world).map((p) => `${p.path} → ${p.key}`)).toEqual([
      'looseEncounters → nobody',
      'chapters.dock.clues → ticket',
      'chapters.dock.handouts → letter',
      'chapters.dock.pages.dock-scene-1.people → marfa',
    ]);
  });

  it('names a link whose words the page does not hold, and a key used twice', () => {
    const twice = parsed((d) => {
      const chapters = d.chapters;
      if (chapters[0])
        chapters[0].pages = [
          { ...page, people: [{ person: 'marfa', words: ['Марфы'] }] },
          {
            ...page,
            cues: [
              {
                key: 'talk',
                kind: 'talk',
                title: 'Разговор',
                words: ['Руна'],
                brief: '',
                details: [],
                encounter: 'nobody',
              },
            ],
          },
        ];
    });
    expect(bookReferenceProblems(twice, world).map((p) => `${p.path} → ${p.key}`)).toEqual([
      'chapters.dock.pages.dock-scene-1.people.words → Марфы',
      'chapters.dock.pages.dock-scene-1 → dock-scene-1',
      'chapters.dock.pages.dock-scene-1.cues.talk.encounter → nobody',
      'chapters.dock.pages.dock-scene-1.cues.talk.words → Руна',
    ]);
  });
});
