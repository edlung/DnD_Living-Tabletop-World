import { randomUUID } from 'node:crypto';

import type { DisplayPairingResponse, MarksResponse, SavedEncounterRequest } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { get, post, ravenfordApp, seededEngine, TOKENS } from '../testing/ravenford-app.ts';
import { signInTable } from '../testing/sign-in.ts';

/**
 * The table's shared marks (docs/adr/0057-encounters-maps-loot.md §5): read by every member and the
 * table's display, laid on a fight's board by the DM always and by a player when the DM allows, the
 * pointer the DM's own and one, a mark removed by its author or the DM, all of them cleared by the
 * DM; they belong to the run of the fight they were laid on.
 */
const MARKS = '/campaigns/ravenford/marks';
const SAVED = '/campaigns/ravenford/encounters/saved';
const PARTY = ['brann-ironvale', 'elowen-starwhisper', 'maren-ashby', 'tamsin-quickfoot'];
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const ON_THE_ROAD: SavedEncounterRequest = {
  name: 'Marks on the road',
  locationId: 'old-trade-road',
  battlefield: { width: 16, height: 12, difficult: [], cover: [] },
  foes: [{ kind: 'bestiary', monsterId: 'goblin-warrior', position: { x: 15, y: 0 } }],
  partyStart: [
    { x: 0, y: 1 },
    { x: 0, y: 3 },
    { x: 0, y: 5 },
    { x: 0, y: 7 },
  ],
};
type App = Awaited<ReturnType<typeof ravenfordApp>>;

/** Ravenford with the party on the Old Trade Road, where a fight can start. */
async function roadEngine(): Promise<WorldEngine> {
  const engine = await seededEngine();
  for (const entityId of PARTY) {
    const result = await engine.execute({
      commandId: `test.travel.${entityId}`,
      campaignId: 'ravenford',
      actor: DM,
      command: { type: 'PlaceEntity', entityId, locationId: 'old-trade-road' },
    });
    expect(result.status).toBe('accepted');
  }
  return engine;
}

/** The DM's saved fight on the road, and a way to start it (again). */
async function savedFight(app: App) {
  const encounterId = randomUUID();
  expect((await post(app, `${SAVED}/${encounterId}`, ON_THE_ROAD, TOKENS.dm)).statusCode).toBe(201);
  const start = async () => {
    const started = await post(
      app,
      `${SAVED}/${encounterId}/start`,
      { requestId: randomUUID() },
      TOKENS.dm,
    );
    expect(started.statusCode).toBe(200);
  };
  return { start };
}

async function fightingApp(): Promise<App> {
  const app = await ravenfordApp(await roadEngine());
  await (await savedFight(app)).start();
  return app;
}

/** A POST as its sender's perspective: the DM's or the player's character. */
const send = (app: App, path: string, body: object, token: string) =>
  post(app, `${path}?perspective=${token === TOKENS.dm ? 'DM' : 'PLAYER'}`, body, token);
const read = async (app: App, token: string) =>
  (
    await get(app, `${MARKS}?perspective=${token === TOKENS.dm ? 'DM' : 'PLAYER'}`, token)
  ).json<MarksResponse>();
const strokeMark = () => ({
  kind: 'stroke',
  markId: randomUUID(),
  squares: [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
  ],
});

describe('the table’s marks', () => {
  it('are read by members, laid by the DM, and by players only when allowed', async () => {
    const app = await ravenfordApp(await roadEngine());
    expect((await get(app, `${MARKS}?perspective=DM`)).statusCode).toBe(401);
    expect((await get(app, `${MARKS}?perspective=PUBLIC`, TOKENS.outsider)).statusCode).toBe(404);
    const fight = await savedFight(app);
    const stroke = strokeMark();
    // A mark is laid on a fight's board: none outside a fight.
    expect((await send(app, MARKS, stroke, TOKENS.dm)).statusCode).toBe(409);
    await fight.start();
    // On the fight's 16 × 12 field only.
    const beyond = {
      ...strokeMark(),
      squares: [
        { x: 15, y: 0 },
        { x: 16, y: 0 },
      ],
    };
    expect((await send(app, MARKS, beyond, TOKENS.dm)).statusCode).toBe(400);
    expect((await send(app, MARKS, stroke, TOKENS.dm)).statusCode).toBe(201);
    // A retried mark lays nothing twice.
    expect((await send(app, MARKS, stroke, TOKENS.dm)).statusCode).toBe(200);
    const ping = { kind: 'ping', markId: randomUUID(), square: { x: 3, y: 3 } };
    expect((await send(app, MARKS, ping, TOKENS.player)).statusCode).toBe(403);
    expect((await read(app, TOKENS.player)).playersMayMark).toBe(false);
    expect(
      (await send(app, `${MARKS}/settings`, { playersMayMark: true }, TOKENS.player)).statusCode,
    ).toBe(403);
    expect(
      (await send(app, `${MARKS}/settings`, { playersMayMark: true }, TOKENS.dm)).statusCode,
    ).toBe(200);
    expect((await send(app, MARKS, ping, TOKENS.player)).statusCode).toBe(201);
    // The pointer is the DM's.
    const pointer = { kind: 'pointer', markId: randomUUID(), square: { x: 4, y: 4 } };
    expect((await send(app, MARKS, pointer, TOKENS.player)).statusCode).toBe(403);
    const seen = await read(app, TOKENS.player);
    expect(seen.playersMayMark).toBe(true);
    expect(seen.marks.map((mark) => [mark.kind, mark.by])).toEqual([
      ['stroke', 'dm'],
      ['ping', 'player'],
    ]);
  });

  it('keep one DM pointer, and are removed by their author, the DM, or cleared', async () => {
    const app = await fightingApp();
    await send(app, `${MARKS}/settings`, { playersMayMark: true }, TOKENS.dm);
    const point = (x: number) => ({ kind: 'pointer', markId: randomUUID(), square: { x, y: 0 } });
    await send(app, MARKS, point(1), TOKENS.dm);
    await send(app, MARKS, point(5), TOKENS.dm);
    const pointers = (await read(app, TOKENS.dm)).marks.filter((mark) => mark.kind === 'pointer');
    expect(pointers.map((mark) => mark.square)).toEqual([{ x: 5, y: 0 }]);
    const theirs = { kind: 'area', markId: randomUUID(), squares: [{ x: 2, y: 2 }] };
    const dms = { kind: 'area', markId: randomUUID(), squares: [{ x: 6, y: 6 }] };
    await send(app, MARKS, theirs, TOKENS.player);
    await send(app, MARKS, dms, TOKENS.dm);
    // A player removes their own mark, never the DM's.
    expect((await send(app, `${MARKS}/${dms.markId}/delete`, {}, TOKENS.player)).statusCode).toBe(
      403,
    );
    expect(
      (await send(app, `${MARKS}/${theirs.markId}/delete`, {}, TOKENS.player)).statusCode,
    ).toBe(204);
    expect((await send(app, `${MARKS}/clear`, {}, TOKENS.player)).statusCode).toBe(403);
    expect((await send(app, `${MARKS}/clear`, {}, TOKENS.dm)).statusCode).toBe(204);
    expect((await read(app, TOKENS.dm)).marks).toEqual([]);
  });

  it('belong to the run of the fight they were laid on', async () => {
    const engine = await roadEngine();
    const app = await ravenfordApp(engine);
    const fight = await savedFight(app);
    await fight.start();
    expect((await send(app, MARKS, strokeMark(), TOKENS.dm)).statusCode).toBe(201);
    expect((await read(app, TOKENS.player)).marks).toHaveLength(1);
    // The fight ends: its marks go from every board.
    const running = (await engine.load('ravenford'))?.state.encounter?.encounterId ?? '';
    const ended = await engine.execute({
      commandId: 'test.end-fight',
      campaignId: 'ravenford',
      actor: DM,
      command: { type: 'EndCombat', encounterId: running },
    });
    expect(ended.status).toBe('accepted');
    expect((await read(app, TOKENS.dm)).marks).toEqual([]);
    // The same saved encounter fought again begins with a clean board.
    await fight.start();
    expect((await read(app, TOKENS.dm)).marks).toEqual([]);
  });

  it('show on the table’s display, which never marks', async () => {
    const table = await signInTable({ engine: await roadEngine() });
    const dm = await table.signInWith(await table.dmInvitation());
    const asked = await table.send('POST', '/display/pair', {}, {});
    const header = asked.headers['set-cookie'];
    const cookie =
      (Array.isArray(header) ? header : [header ?? ''])
        .map((value) => value.split(';')[0] ?? '')
        .find((pair) => pair.startsWith('ltw_display=')) ?? '';
    const { code } = asked.json<DisplayPairingResponse>();
    await table.send('POST', '/campaigns/ravenford/displays', { cookie: dm }, { code });
    const encounterId = randomUUID();
    await table.send('POST', `${SAVED}/${encounterId}`, { cookie: dm }, ON_THE_ROAD);
    const started = await table.send(
      'POST',
      `${SAVED}/${encounterId}/start`,
      { cookie: dm },
      { requestId: randomUUID() },
    );
    expect(started.statusCode).toBe(200);
    const ping = { kind: 'ping', markId: randomUUID(), square: { x: 3, y: 3 } };
    const laid = await table.send('POST', `${MARKS}?perspective=DM`, { cookie: dm }, ping);
    expect(laid.statusCode).toBe(201);
    const shown = await table.send('GET', `${MARKS}?perspective=PARTY`, { cookie });
    expect(shown.statusCode).toBe(200);
    expect(shown.json<MarksResponse>().marks.map((mark) => mark.kind)).toEqual(['ping']);
    const again = { kind: 'ping', markId: randomUUID(), square: { x: 4, y: 4 } };
    expect(
      (await table.send('POST', `${MARKS}?perspective=PARTY`, { cookie }, again)).statusCode,
    ).toBe(403);
  });
});
