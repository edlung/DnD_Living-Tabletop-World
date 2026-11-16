import type {
  DisplayPairingResponse,
  DmEnvelopesResponse,
  EnvelopesResponse,
  HandoutsResponse,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OPEN_WHEN_FINISHED } from '../ending/guard.ts';
import { liveRavenford, readyLive } from '../testing/live.ts';
import { TOKENS, get, post, ravenfordApp } from '../testing/ravenford-app.ts';
import { signInTable } from '../testing/sign-in.ts';

/**
 * Sealed envelopes (docs/adr/0073-table-ideas.md §9): the DM seals a kept handout; the party sees
 * the envelope from outside and never its inside; it opens on the DM's word, or by itself when the
 * evening's chapter is written, and is then a handout like any other.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const INSIDE_TITLE = 'A letter from the miller';
const INSIDE_TEXT = 'The cart was never robbed. Meet me at the mill.';
const LABEL = 'Open after the battle';
// The Abandoned Caravan Site: the DM's secret until the party finds it (knowledge-boundary.json).
const SECRET = 'location-f3b82c8b';

const keep = (entry: number, body: unknown = { title: INSIDE_TITLE, text: INSIDE_TEXT }) =>
  post(app, `${BASE}/dm/library/handouts/${ID(entry)}`, body, TOKENS.dm);
const seal = (envelope: number, body: unknown, token: string = TOKENS.dm) =>
  post(app, `${BASE}/dm/envelopes/${ID(envelope)}`, body, token);
const open = (envelope: number, token: string = TOKENS.dm) =>
  post(app, `${BASE}/dm/envelopes/${ID(envelope)}/open`, {}, token);
const outside = (perspective: string, token: string) =>
  get(app, `${BASE}/envelopes?perspective=${perspective}`, token);
const sealedFor = async (perspective: string, token: string) =>
  (await outside(perspective, token)).json<EnvelopesResponse>().envelopes;
const handoutsOf = async (perspective: string, token: string) =>
  (await get(app, `${BASE}/handouts?perspective=${perspective}`, token)).json<HandoutsResponse>()
    .handouts;
const dmList = async () =>
  (await get(app, `${BASE}/dm/envelopes`, TOKENS.dm)).json<DmEnvelopesResponse>().envelopes;

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  await app.close();
});

describe('a sealed envelope', () => {
  it('is sealed by the DM from a kept handout, and seen by the party from outside only', async () => {
    expect((await keep(1)).statusCode).toBe(201);
    expect((await seal(10, { entryId: ID(1), label: LABEL, opens: 'word' })).statusCode).toBe(201);
    // A retried request seals one envelope.
    expect((await seal(10, { entryId: ID(1), label: LABEL, opens: 'word' })).statusCode).toBe(200);
    for (const [perspective, token] of [
      ['PLAYER', TOKENS.player],
      ['PARTY', TOKENS.player],
      ['DM', TOKENS.dm],
    ] as const) {
      const read = await outside(perspective, token);
      expect(read.json<EnvelopesResponse>().envelopes, perspective).toEqual([
        {
          envelopeId: ID(10),
          label: LABEL,
          opens: 'word',
          sealedAt: expect.any(String) as string,
        },
      ]);
      // Nothing of the inside is in the answer: not for the party, not even for the DM here.
      expect(read.body).not.toContain('miller');
      expect(read.body).not.toContain('mill');
    }
    // No handout was given by sealing.
    expect(await handoutsOf('PLAYER', TOKENS.player)).toEqual([]);
    // The DM's own list has the inside.
    expect(await dmList()).toMatchObject([
      { envelopeId: ID(10), label: LABEL, title: INSIDE_TITLE, text: INSIDE_TEXT, openedAt: null },
    ]);
  });

  it('opens on the DM’s word: the inside is a handout for the party, once', async () => {
    await keep(1);
    await seal(10, { entryId: ID(1), label: LABEL, opens: 'word' });
    expect((await open(10)).statusCode).toBe(204);
    // Open already: the word is taken, and nothing is given twice.
    expect((await open(10)).statusCode).toBe(204);
    expect(await sealedFor('PLAYER', TOKENS.player)).toEqual([]);
    const handouts = await handoutsOf('PLAYER', TOKENS.player);
    expect(handouts).toHaveLength(1);
    expect(handouts[0]).toMatchObject({ title: INSIDE_TITLE, text: INSIDE_TEXT, to: 'party' });
    expect((await dmList())[0]).toMatchObject({ openedBy: 'word' });
    // The kept handout is still in the library, as a given one is.
    const library = await get(app, `${BASE}/dm/library`, TOKENS.dm);
    expect(library.body).toContain(INSIDE_TITLE);
  });

  it('keeps the inside it was sealed with, whatever happens to the kept handout after', async () => {
    await keep(1);
    await seal(10, { entryId: ID(1), label: LABEL, opens: 'word' });
    await keep(1, { title: 'Changed since', text: 'Other words.' });
    await post(app, `${BASE}/dm/library/handouts/${ID(1)}/delete`, {}, TOKENS.dm);
    await open(10);
    expect((await handoutsOf('PLAYER', TOKENS.player))[0]).toMatchObject({
      title: INSIDE_TITLE,
      text: INSIDE_TEXT,
    });
  });

  it('opens by itself when the chapter of its evening is written, and no other chapter opens it', async () => {
    await keep(1);
    await keep(2, { title: 'Stays shut', text: 'Not yet.' });
    await seal(10, { entryId: ID(1), label: LABEL, opens: 'chapter' });
    await seal(11, { entryId: ID(2), label: 'For later', opens: 'word' });
    expect((await dmList())[0]).toMatchObject({
      opens: 'chapter',
      evening: 'Session 1: Arrival in Ravenford',
    });
    const chapter = (body: Record<string, unknown>) =>
      post(app, `${BASE}/chronicle`, { title: 'A chapter', from: 0, ...body }, TOKENS.dm);
    // A chapter told from one character, and one of no evening, open nothing.
    await chapter({ perspective: 'CHARACTER:elowen-starwhisper', sessionId: 'ravenford-s1' });
    await chapter({ perspective: 'PARTY' });
    expect(await sealedFor('PLAYER', TOKENS.player)).toHaveLength(2);
    // The party's chapter of the evening does — and only the envelope that waits for it.
    const written = await chapter({ perspective: 'PARTY', sessionId: 'ravenford-s1' });
    expect(written.statusCode).toBeLessThan(300);
    expect((await sealedFor('PLAYER', TOKENS.player)).map((one) => one.label)).toEqual([
      'For later',
    ]);
    expect((await handoutsOf('PLAYER', TOKENS.player)).map((one) => one.title)).toEqual([
      INSIDE_TITLE,
    ]);
    expect((await dmList()).find((one) => one.envelopeId === ID(10))).toMatchObject({
      openedBy: 'chapter',
    });
  });

  it('stays sealed while the party does not know what is pictured inside', async () => {
    await keep(1, { title: 'A map of the site', entityId: SECRET });
    await seal(10, { entryId: ID(1), label: 'A rolled map', opens: 'word' });
    expect((await open(10)).statusCode).toBe(422);
    expect(await sealedFor('PLAYER', TOKENS.player)).toHaveLength(1);
    expect(await handoutsOf('PLAYER', TOKENS.player)).toEqual([]);
    // Nor does its outside name what is inside.
    expect((await outside('PLAYER', TOKENS.player)).body).not.toContain(SECRET);
  });

  it('is the DM’s alone to seal, open, delete and read whole', async () => {
    await keep(1);
    const body = { entryId: ID(1), label: LABEL, opens: 'word' };
    expect((await seal(10, body, TOKENS.player)).statusCode).toBe(403);
    expect((await seal(10, body, TOKENS.outsider)).statusCode).toBe(404);
    expect((await post(app, `${BASE}/dm/envelopes/${ID(10)}`, body)).statusCode).toBe(401);
    await seal(10, body);
    expect((await open(10, TOKENS.player)).statusCode).toBe(403);
    expect((await get(app, `${BASE}/dm/envelopes`, TOKENS.player)).statusCode).toBe(403);
    expect((await get(app, `${BASE}/dm/envelopes`, TOKENS.outsider)).statusCode).toBe(404);
    const remove = (token: string) =>
      post(app, `${BASE}/dm/envelopes/${ID(10)}/delete`, {}, token);
    expect((await remove(TOKENS.player)).statusCode).toBe(403);
    expect(await sealedFor('PLAYER', TOKENS.player)).toHaveLength(1);
    expect((await remove(TOKENS.dm)).statusCode).toBe(204);
    expect(await sealedFor('PLAYER', TOKENS.player)).toEqual([]);
    expect((await remove(TOKENS.dm)).statusCode).toBe(404);
  });

  it('is not the public’s to see, nor a stranger’s', async () => {
    await keep(1);
    await seal(10, { entryId: ID(1), label: LABEL, opens: 'word' });
    expect((await outside('PUBLIC', TOKENS.player)).statusCode).toBe(403);
    expect((await outside('PARTY', TOKENS.outsider)).statusCode).toBe(404);
    expect((await get(app, `${BASE}/envelopes?perspective=PARTY`)).statusCode).toBe(401);
  });

  it('is sealed from a kept handout only, with words on its outside', async () => {
    await keep(1);
    for (const body of [
      { entryId: ID(1), label: '   ', opens: 'word' },
      { entryId: ID(1), label: 'x'.repeat(121), opens: 'word' },
      { entryId: ID(1), label: LABEL, opens: 'midnight' },
      { entryId: ID(1), label: LABEL },
      { entryId: 'not-an-id', label: LABEL, opens: 'word' },
      { entryId: ID(1), label: LABEL, opens: 'word', title: 'Mine', text: 'Injected.' },
    ]) {
      expect((await seal(10, body)).statusCode, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
    expect((await seal(10, { entryId: ID(99), label: LABEL, opens: 'word' })).statusCode).toBe(404);
    expect(await dmList()).toEqual([]);
  });

  it('is not sealed, opened or deleted in a finished campaign', () => {
    for (const route of [
      '/campaigns/:campaignId/dm/envelopes/:envelopeId',
      '/campaigns/:campaignId/dm/envelopes/:envelopeId/open',
      '/campaigns/:campaignId/dm/envelopes/:envelopeId/delete',
    ]) {
      expect(OPEN_WHEN_FINISHED.has(route), route).toBe(false);
    }
  });
});

describe('a table display', () => {
  it('reads an envelope from outside as the party does, and never its inside', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const asked = await table.send('POST', '/display/pair', {}, {});
    const header = asked.headers['set-cookie'];
    const cookie =
      (Array.isArray(header) ? header : [header ?? ''])
        .map((value) => value.split(';')[0] ?? '')
        .find((pair) => pair.startsWith('ltw_display=')) ?? '';
    const { code } = asked.json<DisplayPairingResponse>();
    await table.send('POST', `${BASE}/displays`, { cookie: dm }, { code });
    await table.send(
      'POST',
      `${BASE}/dm/library/handouts/${ID(1)}`,
      { cookie: dm },
      { title: INSIDE_TITLE, text: INSIDE_TEXT },
    );
    await table.send(
      'POST',
      `${BASE}/dm/envelopes/${ID(10)}`,
      { cookie: dm },
      { entryId: ID(1), label: LABEL, opens: 'word' },
    );
    const shown = await table.send('GET', `${BASE}/envelopes?perspective=PARTY`, { cookie });
    expect(shown.statusCode).toBe(200);
    expect(shown.body).toContain(LABEL);
    expect(shown.body).not.toContain('miller');
    expect((await table.send('GET', `${BASE}/dm/envelopes`, { cookie })).statusCode).toBe(403);
    await table.app.close();
  });
});

describe('an envelope and the live stream', () => {
  it('signals the party when one is sealed and when it opens', async () => {
    const live = await liveRavenford();
    const player = await readyLive(live.app, `${BASE}/live?perspective=PLAYER`, TOKENS.player);
    const changes = () =>
      player.messages().filter((message) => message.type === 'changed').length;
    await live.hub.cycle();
    await live.hub.cycle();
    const before = changes();
    await post(
      live.app,
      `${BASE}/dm/library/handouts/${ID(1)}`,
      { title: INSIDE_TITLE, text: INSIDE_TEXT },
      TOKENS.dm,
    );
    await live.hub.cycle();
    // A handout kept in the library is nothing the party reads.
    expect(changes()).toBe(before);
    await post(
      live.app,
      `${BASE}/dm/envelopes/${ID(10)}`,
      { entryId: ID(1), label: LABEL, opens: 'word' },
      TOKENS.dm,
    );
    await live.hub.cycle();
    expect(changes()).toBe(before + 1);
    await post(live.app, `${BASE}/dm/envelopes/${ID(10)}/open`, {}, TOKENS.dm);
    await live.hub.cycle();
    expect(changes()).toBe(before + 2);
    player.disconnect();
    await live.app.close();
  });
});
