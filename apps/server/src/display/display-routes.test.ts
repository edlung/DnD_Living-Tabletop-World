import type {
  CastResponse,
  CreatedTableLinkResponse,
  DisplayJoinResponse,
  DisplayListResponse,
  DisplayPairingResponse,
  DisplaySessionResponse,
  TableLinkStatusResponse,
  TableOfferResponse,
  TableSeatResponse,
} from '@ltw/contracts';
import type { LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';

import { SEREN, signInTable, type SignInTable } from '../testing/sign-in.ts';

/**
 * The table display and the table's join link (docs/adr/0042-table-display.md): a device pairs by
 * the code the DM types, reads the PUBLIC and PARTY views and the DM's cast, writes nothing; the
 * DM's table link seats a person in a free seat through an ordinary single-use invitation.
 */
const cookieOf = (response: LightMyRequestResponse, name: string): string => {
  const header = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header];
  return (
    values.map((value) => value.split(';')[0] ?? '').find((p) => p.startsWith(`${name}=`)) ?? ''
  );
};

/** A device asking to pair: its cookie and the code it shows. */
async function pending(table: SignInTable) {
  const asked = await table.send('POST', '/display/pair', {}, {});
  expect(asked.statusCode).toBe(201);
  return {
    cookie: cookieOf(asked, 'ltw_display'),
    code: asked.json<DisplayPairingResponse>().code,
  };
}

async function pairedDisplay(table: SignInTable) {
  const dm = await table.signInWith(await table.dmInvitation());
  const device = await pending(table);
  // Typed as people type it: lower case, spaced.
  const typed = `${device.code.slice(0, 4).toLowerCase()} ${device.code.slice(4)}`;
  const paired = await table.send(
    'POST',
    '/campaigns/ravenford/displays',
    { cookie: dm },
    { code: typed },
  );
  expect(paired.statusCode).toBe(201);
  return { dm, display: device.cookie };
}

describe('the table display', () => {
  it('pairs by the code the DM types, then reads the party view and never writes', async () => {
    const table = await signInTable();
    const device = await pending(table);
    expect(device.code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    const waiting = await table.send('GET', '/display/session', { cookie: device.cookie });
    expect(waiting.json<DisplaySessionResponse>().state).toBe('pending');
    // Nothing opens before the DM pairs it.
    const early = '/campaigns/ravenford/entities?perspective=PARTY';
    expect((await table.send('GET', early, { cookie: device.cookie })).statusCode).toBe(401);

    const dm = await table.signInWith(await table.dmInvitation());
    const paired = await table.send(
      'POST',
      '/campaigns/ravenford/displays',
      { cookie: dm },
      {
        code: device.code,
      },
    );
    expect(paired.statusCode).toBe(201);
    const session = await table.send('GET', '/display/session', { cookie: device.cookie });
    expect(session.json<DisplaySessionResponse>()).toMatchObject({
      state: 'paired',
      campaignId: 'ravenford',
      name: 'TV 1',
    });
    const read = (url: string) => table.send('GET', url, { cookie: device.cookie });
    expect((await read('/campaigns/ravenford/entities?perspective=PARTY')).statusCode).toBe(200);
    expect((await read('/campaigns/ravenford/entities?perspective=PUBLIC')).statusCode).toBe(200);
    expect((await read('/campaigns/ravenford/entities?perspective=DM')).statusCode).toBe(403);
    expect((await read('/campaigns/other-table/entities?perspective=PARTY')).statusCode).toBe(404);
    expect((await read('/campaigns/other-table/display/cast')).statusCode).toBe(404);
    expect((await read('/campaigns/other-table/display/join')).statusCode).toBe(404);
    // No write, whatever the route; and the people's pages do not take it for a sign-in.
    const write = await table.send(
      'POST',
      '/campaigns/ravenford/rolls',
      { cookie: device.cookie },
      {
        requestId: crypto.randomUUID(),
        expression: '1d20',
      },
    );
    expect(write.statusCode).toBe(403);
    expect((await read('/auth/session')).statusCode).toBe(401);
  });

  it('refuses a wrong or late code and a player, and holds four displays at most', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const pair = (code: string, cookie = dm) =>
      table.send('POST', '/campaigns/ravenford/displays', { cookie }, { code });
    expect((await pair('ABCDEFGH')).statusCode).toBe(404);
    expect((await pair('not a code')).statusCode).toBe(400);
    const { token } = await table.invite(dm, SEREN);
    const player = await table.signInWith(token);
    const device = await pending(table);
    expect((await pair(device.code, player)).statusCode).toBe(403);
    table.clock.advance(11 * 60_000);
    expect((await pair(device.code)).statusCode).toBe(404);
    for (let index = 0; index < 4; index += 1) {
      expect((await pair((await pending(table)).code)).statusCode).toBe(201);
    }
    const fifth = await pair((await pending(table)).code);
    expect(fifth.json<{ reason: string }>().reason).toBe('full');
    const listed = await table.send('GET', '/campaigns/ravenford/displays', { cookie: dm });
    expect(listed.json<DisplayListResponse>().displays.map((d) => d.name)).toEqual([
      'TV 1',
      'TV 2',
      'TV 3',
      'TV 4',
    ]);
  });

  it('unpairs one display or all at once, and the device is nobody again', async () => {
    const table = await signInTable();
    const { dm, display } = await pairedDisplay(table);
    const [first] = (
      await table.send('GET', '/campaigns/ravenford/displays', { cookie: dm })
    ).json<DisplayListResponse>().displays;
    const revoked = await table.send(
      'POST',
      `/campaigns/ravenford/displays/${first?.displayId ?? ''}/revoke`,
      { cookie: dm },
      {},
    );
    expect(revoked.json()).toEqual({ revoked: 1 });
    expect((await table.send('GET', '/display/session', { cookie: display })).statusCode).toBe(401);
    const url = '/campaigns/ravenford/entities?perspective=PARTY';
    expect((await table.send('GET', url, { cookie: display })).statusCode).toBe(401);
  });

  it('shows the DM’s cast: where the party is by default, then what the DM chooses', async () => {
    const table = await signInTable();
    const { dm, display } = await pairedDisplay(table);
    const cast = () => table.send('GET', '/campaigns/ravenford/display/cast', { cookie: display });
    expect((await cast()).json<CastResponse>()).toEqual({
      cast: { kind: 'scene', locationId: null },
      revision: 0,
      place: 'market-square',
    });
    const put = (body: unknown, cookie = dm) =>
      table.send('POST', '/campaigns/ravenford/display/cast', { cookie }, body);
    const titled = await put({
      cast: { kind: 'title', title: 'Chapter II', subtitle: 'The road' },
    });
    expect(titled.json<CastResponse>().revision).toBe(1);
    expect((await cast()).json<CastResponse>().cast).toEqual({
      kind: 'title',
      title: 'Chapter II',
      subtitle: 'The road',
    });
    expect((await put({ cast: { kind: 'blank' } }, display)).statusCode).toBe(403);
    expect((await put({ cast: { kind: 'picture', entityId: 'no-such-thing' } })).statusCode).toBe(
      404,
    );
  });

  it('names to a display only the places and pictures the party knows', async () => {
    const table = await signInTable();
    const { dm, display } = await pairedDisplay(table);
    const read = (cookie: string) =>
      table.send('GET', '/campaigns/ravenford/display/cast', { cookie });
    const put = (cast: unknown) =>
      table.send('POST', '/campaigns/ravenford/display/cast', { cookie: dm }, { cast });
    // The Abandoned Caravan Site: the DM's secret until the party finds it (knowledge-boundary.json).
    const SECRET = 'location-f3b82c8b';
    expect((await put({ kind: 'scene', locationId: SECRET })).statusCode).toBe(200);
    expect((await read(dm)).json<CastResponse>()).toMatchObject({
      cast: { kind: 'scene', locationId: SECRET },
      place: SECRET,
    });
    const shown = await read(display);
    expect(shown.json<CastResponse>()).toMatchObject({
      cast: { kind: 'scene', locationId: null },
      place: null,
    });
    expect(shown.body.includes(SECRET)).toBe(false);
    expect((await put({ kind: 'picture', entityId: SECRET })).statusCode).toBe(200);
    expect((await read(display)).json<CastResponse>().cast).toEqual({ kind: 'blank' });
    // Whom the battlefield keeps in view: named only when the party knows it, else whoever acts.
    expect((await put({ kind: 'battlefield', zoom: 1.5, focus: SECRET })).statusCode).toBe(200);
    expect((await read(display)).json<CastResponse>()).toEqual({
      cast: { kind: 'battlefield', zoom: 1.5, focus: null },
      revision: 3,
      place: null,
    });
    expect((await put({ kind: 'battlefield', focus: 'no-such-thing' })).statusCode).toBe(404);
    // A place the party knows is shown as cast.
    await put({ kind: 'scene', locationId: 'golden-stag-inn' });
    expect((await read(display)).json<CastResponse>()).toMatchObject({
      cast: { kind: 'scene', locationId: 'golden-stag-inn' },
      place: 'golden-stag-inn',
    });
  });
});

describe('the table’s join link', () => {
  it('offers the free seats and seats a person through a single-use invitation', async () => {
    const table = await signInTable();
    const { dm, display } = await pairedDisplay(table);
    const opened = await table.send('POST', '/campaigns/ravenford/table-link', { cookie: dm }, {});
    expect(opened.statusCode).toBe(201);
    const { link, code } = opened.json<CreatedTableLinkResponse>();
    expect(link.startsWith('https://table.example/table#')).toBe(true);
    // The table's display shows it, for the room to scan.
    const join = await table.send('GET', '/campaigns/ravenford/display/join', { cookie: display });
    expect(join.json<DisplayJoinResponse>()).toMatchObject({ link, code });

    const key = { token: link.slice(link.indexOf('#') + 1) };
    const offer = await table.send('POST', '/auth/table/offer', {}, { key });
    const seats = offer.json<TableOfferResponse>().characters.map((ref) => ref.entityId);
    expect(seats).toContain(SEREN);
    const seat = await table.send(
      'POST',
      '/auth/table/seat',
      {},
      { key: { code }, characterId: SEREN },
    );
    const { token } = seat.json<TableSeatResponse>();
    expect((await table.redeem(token)).statusCode).toBe(200);
    const status = await table.send('GET', '/campaigns/ravenford/table-link', { cookie: dm });
    const seated = status.json<TableLinkStatusResponse>().seated;
    expect(seated.map((seat) => [seat.character.entityId, seat.taken])).toEqual([[SEREN, true]]);
    // Seren's seat is no longer offered; a closed link offers nothing.
    const again = await table.send('POST', '/auth/table/offer', {}, { key });
    expect(again.json<TableOfferResponse>().characters.map((ref) => ref.entityId)).not.toContain(
      SEREN,
    );
    await table.send('POST', '/campaigns/ravenford/table-link/close', { cookie: dm }, {});
    expect((await table.send('POST', '/auth/table/offer', {}, { key })).statusCode).toBe(401);
    const shown = await table.send('GET', '/campaigns/ravenford/display/join', { cookie: display });
    expect(shown.json<DisplayJoinResponse>()).toEqual({ link: null, code: null, expiresAt: null });
  });

  it('rests a client after five wrong codes', async () => {
    const table = await signInTable();
    const wrong = () => table.send('POST', '/auth/table/offer', {}, { key: { code: 'ABCDEFGH' } });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await wrong()).statusCode).toBe(401);
    }
    expect((await wrong()).statusCode).toBe(429);
  });
});
