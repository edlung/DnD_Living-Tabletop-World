import type { AgreementResponse, DisplayPairingResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TOKENS, get, post, ravenfordApp } from '../testing/ravenford-app.ts';
import { signInTable } from '../testing/sign-in.ts';

/**
 * The table's agreement (docs/adr/0071-memory-and-ritual.md §4): the DM writes it; every member
 * and a table display read the same page; a player says "Understood" for their own character, the
 * DM for anyone at the table; who has said it is the DM's to read.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';
const BRANN = 'brann-ironvale';
const PAGE = {
  tone: 'adventurous',
  toneNote: 'Like a Saturday cartoon.',
  limits: ['torture', 'gore'],
  alsoNot: 'Spiders\nClowns',
  pauseSign: 'Raise a hand.',
  ages: 'Children from eight.',
};

const write = (body: Record<string, unknown>, perspective = 'DM', token: string = TOKENS.dm) =>
  post(app, `${BASE}/agreement?perspective=${perspective}`, body, token);
const read = async (perspective: string, token: string) =>
  (await get(app, `${BASE}/agreement?perspective=${perspective}`, token)).json<AgreementResponse>();
const understood = (
  body: Record<string, unknown>,
  perspective = 'PLAYER',
  token: string = TOKENS.player,
) => post(app, `${BASE}/agreement/understood?perspective=${perspective}`, body, token);

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  await app.close();
});

describe('the table’s agreement', () => {
  it('is the DM’s to write and everyone’s to read, the same page', async () => {
    expect(await read('PLAYER', TOKENS.player)).toMatchObject({
      agreement: null,
      understood: false,
    });
    expect((await write(PAGE, 'PLAYER', TOKENS.player)).statusCode).toBe(403);
    expect((await write(PAGE, 'PARTY', TOKENS.player)).statusCode).toBe(403);
    expect((await write(PAGE)).statusCode).toBe(204);

    const mine = await read('PLAYER', TOKENS.player);
    expect(mine.agreement).toMatchObject({
      ...PAGE,
      limits: ['gore', 'torture'],
      version: 1,
    });
    expect(mine.understood).toBe(false);
    // Who has said "Understood" is the DM's to read.
    expect(mine.readers).toBeNull();
    const party = await read('PARTY', TOKENS.player);
    expect(party.agreement).toEqual(mine.agreement);
    expect(party.understood).toBeNull();
    const dm = await read('DM', TOKENS.dm);
    expect(dm.agreement).toEqual(mine.agreement);
    expect(dm.understood).toBeNull();
    expect(dm.readers?.map((reader) => reader.character.entityId)).toContain(ELOWEN);
    expect(dm.readers?.every((reader) => !reader.understood)).toBe(true);
    // A stranger finds nothing.
    expect(
      (await get(app, `${BASE}/agreement?perspective=PUBLIC`, TOKENS.outsider)).statusCode,
    ).toBe(404);
  });

  it('refuses a page out of shape', async () => {
    expect((await write({ ...PAGE, tone: 'silly' })).statusCode).toBe(400);
    expect((await write({ ...PAGE, limits: ['gore', 'gore'] })).statusCode).toBe(400);
    expect((await write({ ...PAGE, limits: ['dragons'] })).statusCode).toBe(400);
    expect((await write({ ...PAGE, pauseSign: 'x'.repeat(201) })).statusCode).toBe(400);
    expect((await write({ ...PAGE, alsoNot: 'x'.repeat(401) })).statusCode).toBe(400);
    expect((await write({ ...PAGE, extra: true })).statusCode).toBe(400);
    expect((await read('DM', TOKENS.dm)).agreement).toBeNull();
  });

  it('takes “Understood” for the page as it stands, from the player or from the DM for them', async () => {
    await write(PAGE);
    // Not for another character, not through the party's view, not for an NPC or a version unseen.
    expect((await understood({ version: 1, characterId: BRANN })).statusCode).toBe(403);
    expect((await understood({ version: 1, characterId: ELOWEN }, 'PARTY')).statusCode).toBe(403);
    expect((await understood({ version: 2, characterId: ELOWEN })).statusCode).toBe(422);
    expect(
      (await understood({ version: 1, characterId: 'mira-vale' }, 'DM', TOKENS.dm)).statusCode,
    ).toBe(422);
    expect((await understood({ version: 1, characterId: ELOWEN })).statusCode).toBe(204);
    expect((await read('PLAYER', TOKENS.player)).understood).toBe(true);
    // The DM says it for a child who said it aloud.
    expect((await understood({ version: 1, characterId: BRANN }, 'DM', TOKENS.dm)).statusCode).toBe(
      204,
    );
    const readers = (await read('DM', TOKENS.dm)).readers ?? [];
    const said = (id: string) =>
      readers.find((reader) => reader.character.entityId === id)?.understood;
    expect(said(ELOWEN)).toBe(true);
    expect(said(BRANN)).toBe(true);
  });

  it('asks again when the words change, and not when they do not', async () => {
    await write(PAGE);
    await understood({ version: 1, characterId: ELOWEN });
    // The same words, the limits in another order: the same version, nobody asked again.
    expect((await write({ ...PAGE, limits: ['gore', 'torture'] })).statusCode).toBe(204);
    expect((await read('PLAYER', TOKENS.player)).agreement?.version).toBe(1);
    expect((await read('PLAYER', TOKENS.player)).understood).toBe(true);
    // New words: a new version, and "Understood" is asked again; the old version is refused.
    expect((await write({ ...PAGE, tone: 'spooky' })).statusCode).toBe(204);
    const after = await read('PLAYER', TOKENS.player);
    expect(after.agreement?.version).toBe(2);
    expect(after.understood).toBe(false);
    expect((await understood({ version: 1, characterId: ELOWEN })).statusCode).toBe(422);
    expect((await understood({ version: 2, characterId: ELOWEN })).statusCode).toBe(204);
  });

  it('is read by a table display, which writes nothing', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const asked = await table.send('POST', '/display/pair', {}, {});
    const header = asked.headers['set-cookie'];
    const cookie =
      (Array.isArray(header) ? header : [header ?? ''])
        .map((value) => value.split(';')[0] ?? '')
        .find((pair) => pair.startsWith('ltw_display=')) ?? '';
    const { code } = asked.json<DisplayPairingResponse>();
    await table.send('POST', '/campaigns/ravenford/displays', { cookie: dm }, { code });
    const written = await table.send(
      'POST',
      `${BASE}/agreement?perspective=DM`,
      { cookie: dm },
      PAGE,
    );
    expect(written.statusCode).toBe(204);
    const shown = await table.send('GET', `${BASE}/agreement?perspective=PARTY`, { cookie });
    expect(shown.statusCode).toBe(200);
    expect(shown.json<AgreementResponse>()).toMatchObject({
      agreement: { tone: 'adventurous', version: 1 },
      understood: null,
      readers: null,
    });
    expect(
      (await table.send('GET', `${BASE}/agreement?perspective=DM`, { cookie })).statusCode,
    ).toBe(403);
    const tried = await table.send('POST', `${BASE}/agreement?perspective=PARTY`, { cookie }, PAGE);
    expect(tried.statusCode).toBeGreaterThanOrEqual(400);
    await table.app.close();
  });
});
