import type { CampaignBookResponse } from '@ltw/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { CAMPAIGN, dmTable, type DmTable } from '../testing/dm-table.ts';
import { TOKENS, get, post, seededEngine, testDm } from '../testing/ravenford-app.ts';
import { RAVENFORD_RU_FIXTURES_DIR } from '../world-engine/ravenford-seed.ts';
import { loadBuiltInBooks } from './book-source.ts';

/**
 * The DM's book over HTTP (docs/adr/0074-dm-book.md §3): the DM reads the campaign's book and
 * keeps a place in it; nobody else learns even whether the campaign has one; a book that waits
 * for the owner's reading is closed; nothing here changes the world.
 */
const tables: DmTable[] = [];
afterEach(async () => {
  await Promise.all(tables.splice(0).map((table) => table.app.close()));
});
const russian = async (dm = testDm()) => {
  const engine = await seededEngine(undefined, undefined, undefined, RAVENFORD_RU_FIXTURES_DIR);
  const table = await dmTable({ engine, dm });
  tables.push(table);
  return table;
};
const BOOK = `${CAMPAIGN}/dm/book`;
const PLACE = `${BOOK}/place`;

describe('the DM’s book', () => {
  it('gives the DM the book, what its keys are in this world, and an empty place', async () => {
    const { app } = await russian();
    const response = await get(app, BOOK, TOKENS.dm);
    expect(response.statusCode).toBe(200);
    const body = response.json<CampaignBookResponse>().book;
    if (!body) throw new Error('no book');
    expect(body.content.title).toBe('Пропавший караван');
    expect(body.content.chapters[0]?.pages.map((page) => page.key)).toEqual([
      'ravenford-market',
      'ravenford-site',
      'ravenford-orin',
      'ravenford-gate',
      'ravenford-road',
      'ravenford-return',
    ]);
    // A built-in adventure's seed IDs are its book's keys.
    expect(body.ids.entities['mira-vale']).toBe('mira-vale');
    expect(body.ids.entities['market-square']).toBe('market-square');
    expect(body.ids.clues['clue-wheel-sawn']).toBe('clue-wheel-sawn');
    expect(body.ids.encounters['road-ambush']).toBe('road-ambush');
    expect(body.place).toEqual({ ribbon: null, played: [], notes: {} });
    expect(body.found).toEqual([]);
  });

  it('is the DM’s alone, in the DM routes’ order', async () => {
    const { app } = await russian();
    expect((await get(app, BOOK)).statusCode).toBe(401);
    expect((await get(app, BOOK, TOKENS.player)).statusCode).toBe(404);
    expect((await get(app, BOOK, TOKENS.outsider)).statusCode).toBe(404);
    expect((await get(app, '/campaigns/no-such-campaign/dm/book', TOKENS.dm)).statusCode).toBe(404);
    const place = { ribbon: 'ravenford-site', played: [], notes: {} };
    expect((await post(app, PLACE, place)).statusCode).toBe(401);
    expect((await post(app, PLACE, place, TOKENS.player)).statusCode).toBe(404);
    expect((await post(app, PLACE, { ribbon: 7 }, TOKENS.dm)).statusCode).toBe(400);
    expect(
      (await get(app, BOOK, TOKENS.dm)).json<CampaignBookResponse>().book?.place.ribbon,
    ).toBeNull();
  });

  it('keeps the DM’s place and drops what the book does not have', async () => {
    const { app, engine } = await russian();
    const before = (await engine.load('ravenford'))?.history.length;
    const saved = await post(
      app,
      PLACE,
      {
        ribbon: 'ravenford-site',
        played: ['ravenford-1', 'a-chapter-of-another-book'],
        notes: { 'ravenford-site': 'Колесо — первым', 'a-page-of-another-book': 'x' },
      },
      TOKENS.dm,
    );
    expect(saved.statusCode).toBe(200);
    const place = {
      ribbon: 'ravenford-site',
      played: ['ravenford-1'],
      notes: { 'ravenford-site': 'Колесо — первым' },
    };
    expect(saved.json()).toEqual({ place });
    expect((await get(app, BOOK, TOKENS.dm)).json<CampaignBookResponse>().book?.place).toEqual(
      place,
    );
    const gone = await post(app, PLACE, { ribbon: 'not-a-page', played: [], notes: {} }, TOKENS.dm);
    expect(gone.json()).toEqual({ place: { ribbon: null, played: [], notes: {} } });
    // The place is the DM's data beside the world: no command, no event.
    expect((await engine.load('ravenford'))?.history.length).toBe(before);
  });

  it('keeps a book closed while it waits for the owner’s reading', async () => {
    const closed = { ...testDm(), book: { builtIn: await loadBuiltInBooks() } };
    const { app } = await russian(closed);
    const response = await get(app, BOOK, TOKENS.dm);
    expect([response.statusCode, response.json()]).toEqual([200, { book: null }]);
    expect((await get(app, BOOK, TOKENS.player)).statusCode).toBe(404);
    const place = { ribbon: null, played: [], notes: {} };
    expect((await post(app, PLACE, place, TOKENS.dm)).statusCode).toBe(404);
  });

  it('has no book for a campaign in a language its book is not written in, or with none wired', async () => {
    const english = await dmTable();
    tables.push(english);
    expect((await get(english.app, BOOK, TOKENS.dm)).json()).toEqual({ book: null });
    const full = testDm();
    const without = {
      substitutions: full.substitutions,
      notes: full.notes,
      encounters: full.encounters,
      library: full.library,
      clock: full.clock,
    };
    const bare = await russian(without);
    expect((await get(bare.app, BOOK, TOKENS.dm)).statusCode).toBe(404);
  });
});
