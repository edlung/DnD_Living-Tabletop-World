import type { DmNotesResponse, DmNoteView } from '@ltw/contracts';
import { MAX_DM_NOTES } from '@ltw/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { CAMPAIGN, dmTable, type DmTable } from '../testing/dm-table.ts';
import { TOKENS, get, post } from '../testing/ravenford-app.ts';

/**
 * The DM's notes over HTTP (docs/adr/0043-dm-screen.md §5): the DM writes, changes and deletes
 * them in the DM routes' order (401, 400, 404 for anyone but this campaign's DM); a player, an
 * outsider and another campaign see nothing; a campaign holds a bounded number.
 */
const tables: DmTable[] = [];
afterEach(async () => {
  await Promise.all(tables.splice(0).map((table) => table.app.close()));
});

async function table(): Promise<DmTable> {
  const created = await dmTable();
  tables.push(created);
  return created;
}

const NOTES = `${CAMPAIGN}/dm/notes`;

describe('the DM’s notes', () => {
  it('writes, lists, changes and deletes a note for the DM only', async () => {
    const { app } = await table();
    const written = await post(
      app,
      NOTES,
      { title: 'Mira lies', body: 'About the road.' },
      TOKENS.dm,
    );
    expect(written.statusCode).toBe(201);
    const { note } = written.json<{ note: DmNoteView }>();
    const list = async () => (await get(app, NOTES, TOKENS.dm)).json<DmNotesResponse>().notes;
    expect((await list()).map((entry) => entry.title)).toEqual(['Mira lies']);

    const changed = await post(
      app,
      `${NOTES}/${note.noteId}`,
      { title: 'Mira lies', body: 'About the road, and the cart.' },
      TOKENS.dm,
    );
    expect(changed.statusCode).toBe(204);
    expect((await list())[0]?.body).toBe('About the road, and the cart.');

    // Nobody else sees or changes them, in the usual order.
    expect((await get(app, NOTES)).statusCode).toBe(401);
    expect((await get(app, NOTES, TOKENS.player)).statusCode).toBe(404);
    expect((await get(app, NOTES, TOKENS.outsider)).statusCode).toBe(404);
    expect((await post(app, NOTES, { title: '', body: '' }, TOKENS.dm)).statusCode).toBe(400);
    expect((await post(app, NOTES, { title: 'x', body: '' }, TOKENS.player)).statusCode).toBe(404);
    expect(
      (await post(app, `${NOTES}/not-a-note`, { title: 'x', body: '' }, TOKENS.dm)).statusCode,
    ).toBe(400);

    expect((await post(app, `${NOTES}/${note.noteId}/delete`, {}, TOKENS.dm)).statusCode).toBe(204);
    expect(await list()).toEqual([]);
    expect((await post(app, `${NOTES}/${note.noteId}/delete`, {}, TOKENS.dm)).statusCode).toBe(404);
  });

  it('holds a bounded number of notes per campaign', async () => {
    const { app } = await table();
    for (let index = 0; index < MAX_DM_NOTES; index += 1) {
      const made = await post(app, NOTES, { title: `Note ${String(index)}`, body: '' }, TOKENS.dm);
      expect(made.statusCode).toBe(201);
    }
    expect((await post(app, NOTES, { title: 'One more', body: '' }, TOKENS.dm)).statusCode).toBe(
      409,
    );
  });
});
