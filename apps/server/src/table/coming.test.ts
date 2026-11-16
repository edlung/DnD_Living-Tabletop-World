import type { DisplayPairingResponse, LobbyResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OPEN_WHEN_FINISHED } from '../ending/guard.ts';
import { liveRavenford, readyLive } from '../testing/live.ts';
import { TOKENS, get, post, ravenfordApp } from '../testing/ravenford-app.ts';
import { signInTable } from '../testing/sign-in.ts';

/**
 * "I'll come / I can't" for the next game (docs/adr/0073-table-ideas.md §10): a player answers for
 * their own hero and the DM for anyone; the table reads the answers beside the date; a changed
 * date asks again; without a date there is nothing to answer.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';
const BRANN = 'brann-ironvale';
// The DM's secret (knowledge-boundary.json): no player's lobby lists it.
const HIDDEN = 'character-hidden-witness';
const HOUR = 3_600_000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  await app.close();
});

const lobby = async (perspective: string, token: string) =>
  (await get(app, `${BASE}/lobby?perspective=${perspective}`, token)).json<LobbyResponse>();
const setDate = (nextGame: unknown) =>
  post(app, `${BASE}/lobby?perspective=DM`, { nextGame }, TOKENS.dm);
const say = (
  characterId: string,
  coming: unknown,
  perspective = 'PLAYER',
  token: string = TOKENS.player,
) => post(app, `${BASE}/lobby/coming?perspective=${perspective}`, { characterId, coming }, token);
const answers = async (perspective: string, token: string) =>
  Object.fromEntries(
    (await lobby(perspective, token)).characters.map((entry) => [
      entry.character.entityId,
      entry.coming,
    ]),
  );

describe('“I’ll come / I can’t”', () => {
  it('is a player’s for their own hero, the DM’s for anyone, and the table’s to read', async () => {
    await setDate({ at: inHours(6 * 24), note: '' });
    expect((await answers('PLAYER', TOKENS.player))[ELOWEN]).toBeNull();
    expect((await say(ELOWEN, 'yes')).statusCode).toBe(204);
    // Not for another's hero; the DM answers for a child who said it aloud.
    expect((await say(BRANN, 'yes')).statusCode).toBe(403);
    expect((await say(BRANN, 'no', 'DM', TOKENS.dm)).statusCode).toBe(204);
    for (const [perspective, token] of [
      ['PLAYER', TOKENS.player],
      ['PARTY', TOKENS.player],
      ['DM', TOKENS.dm],
    ] as const) {
      expect(await answers(perspective, token), perspective).toMatchObject({
        [ELOWEN]: 'yes',
        [BRANN]: 'no',
      });
    }
    // Changed, and taken back.
    expect((await say(ELOWEN, 'no')).statusCode).toBe(204);
    expect((await answers('PARTY', TOKENS.player))[ELOWEN]).toBe('no');
    expect((await say(ELOWEN, null)).statusCode).toBe(204);
    expect((await answers('PARTY', TOKENS.player))[ELOWEN]).toBeNull();
    expect((await answers('PARTY', TOKENS.player))[BRANN]).toBe('no');
  });

  it('is asked again by a changed date, and has nothing to answer without one', async () => {
    expect((await say(ELOWEN, 'yes')).statusCode).toBe(422);
    const first = inHours(6 * 24);
    await setDate({ at: first, note: '' });
    await say(ELOWEN, 'yes');
    // The DM's line about the date changes nothing asked; nor does another change of the table.
    await setDate({ at: first, note: 'At Grandma’s' });
    await post(app, `${BASE}/lobby?perspective=DM`, { paused: true }, TOKENS.dm);
    await post(app, `${BASE}/lobby?perspective=DM`, { paused: false }, TOKENS.dm);
    expect((await answers('PLAYER', TOKENS.player))[ELOWEN]).toBe('yes');
    // Another day: everyone is asked again — and going back to the first day does not bring
    // the old answer back.
    await setDate({ at: inHours(7 * 24), note: '' });
    expect((await answers('PLAYER', TOKENS.player))[ELOWEN]).toBeNull();
    await setDate({ at: first, note: '' });
    expect((await answers('PLAYER', TOKENS.player))[ELOWEN]).toBeNull();
    await say(ELOWEN, 'no');
    // The date taken away: nothing to read, nothing to answer.
    await setDate(null);
    expect((await answers('DM', TOKENS.dm))[ELOWEN]).toBeNull();
    expect((await say(ELOWEN, 'yes')).statusCode).toBe(422);
    // And a date set anew starts with no answers.
    await setDate({ at: first, note: '' });
    expect((await answers('DM', TOKENS.dm))[ELOWEN]).toBeNull();
  });

  it('takes one of two answers for a character of the campaign, from a member', async () => {
    await setDate({ at: inHours(48), note: '' });
    for (const body of [
      { characterId: ELOWEN, coming: 'maybe' },
      { characterId: ELOWEN, coming: true },
      { characterId: ELOWEN },
      { characterId: ELOWEN, coming: 'yes', note: 'late' },
      { coming: 'yes' },
    ]) {
      const refused = await post(app, `${BASE}/lobby/coming?perspective=PLAYER`, body, TOKENS.player);
      expect(refused.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await say('market-square', 'yes', 'DM', TOKENS.dm)).statusCode).toBe(422);
    expect((await say('nobody-at-all', 'yes', 'DM', TOKENS.dm)).statusCode).toBe(422);
    expect((await say(ELOWEN, 'yes', 'PLAYER', TOKENS.outsider)).statusCode).toBe(404);
    expect(
      (await post(app, `${BASE}/lobby/coming?perspective=PLAYER`, { characterId: ELOWEN, coming: 'yes' }))
        .statusCode,
    ).toBe(401);
    // A player speaking as the party or as the public answers for nobody.
    expect((await say(ELOWEN, 'yes', 'PARTY')).statusCode).toBe(403);
    expect((await say(ELOWEN, 'yes', 'PUBLIC')).statusCode).toBe(403);
    expect((await answers('DM', TOKENS.dm))[ELOWEN]).toBeNull();
  });

  it('tells no player of a character they do not know', async () => {
    await setDate({ at: inHours(48), note: '' });
    // The DM may answer for anyone, a character the party has never met included…
    expect((await say(HIDDEN, 'yes', 'DM', TOKENS.dm)).statusCode).toBe(204);
    expect((await answers('DM', TOKENS.dm))[HIDDEN]).toBe('yes');
    // …and the party's lobby still lists only whom the party knows.
    for (const perspective of ['PLAYER', 'PARTY']) {
      const read = await get(app, `${BASE}/lobby?perspective=${perspective}`, TOKENS.player);
      expect(read.body, perspective).not.toContain(HIDDEN);
    }
    // A player cannot learn whether such a character exists by answering for it.
    expect((await say(HIDDEN, 'yes')).statusCode).toBe(403);
    expect((await say('no-such-character', 'yes')).statusCode).toBe(403);
  });

  it('is not answered in a finished campaign', () => {
    expect(OPEN_WHEN_FINISHED.has('/campaigns/:campaignId/lobby/coming')).toBe(false);
  });
});

describe('a table display', () => {
  it('reads the answers with the date, and gives none', async () => {
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
      `${BASE}/lobby?perspective=DM`,
      { cookie: dm },
      { nextGame: { at: inHours(48), note: '' } },
    );
    await table.send(
      'POST',
      `${BASE}/lobby/coming?perspective=DM`,
      { cookie: dm },
      { characterId: ELOWEN, coming: 'yes' },
    );
    const shown = await table.send('GET', `${BASE}/lobby?perspective=PARTY`, { cookie });
    expect(shown.statusCode).toBe(200);
    const mine = shown
      .json<LobbyResponse>()
      .characters.find((entry) => entry.character.entityId === ELOWEN);
    expect(mine?.coming).toBe('yes');
    const tried = await table.send(
      'POST',
      `${BASE}/lobby/coming?perspective=PARTY`,
      { cookie },
      { characterId: ELOWEN, coming: 'no' },
    );
    expect(tried.statusCode).toBe(403);
    await table.app.close();
  });
});

describe('an answer and the live stream', () => {
  it('signals everyone who reads the lobby', async () => {
    const live = await liveRavenford();
    await post(
      live.app,
      `${BASE}/lobby?perspective=DM`,
      { nextGame: { at: inHours(48), note: '' } },
      TOKENS.dm,
    );
    const dm = await readyLive(live.app, `${BASE}/live?perspective=DM`, TOKENS.dm);
    const changes = () => dm.messages().filter((message) => message.type === 'changed').length;
    await live.hub.cycle();
    await live.hub.cycle();
    const before = changes();
    await post(
      live.app,
      `${BASE}/lobby/coming?perspective=PLAYER`,
      { characterId: ELOWEN, coming: 'yes' },
      TOKENS.player,
    );
    await live.hub.cycle();
    expect(changes()).toBe(before + 1);
    dm.disconnect();
    await live.app.close();
  });
});
