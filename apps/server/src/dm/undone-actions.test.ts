import type {
  DmHistoryEntry,
  KnownEntitiesResponse,
  SurroundingsResponse,
  UndoneActionsResponse,
} from '@ltw/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { undoneActions } from '../http/routes/undone-routes.ts';
import { CAMPAIGN, dmTable, ELOWEN, type DmTable } from '../testing/dm-table.ts';
import { TOKENS, get } from '../testing/ravenford-app.ts';

/**
 * A player's action the DM undoes (ADR 0033, amendment of 2026-10-28): in the DM history a
 * blocker that is a player's own action says whose and what, and afterwards the player's own
 * view lists it (the client's notice), built from that player's own command only; any other
 * perspective gets nothing.
 */
const tables: DmTable[] = [];
afterEach(async () => {
  await Promise.all(tables.splice(0).map((table) => table.app.close()));
});

const CAMP = 'location-f3b82c8b';
const AS_ELOWEN = `perspective=CHARACTER:${ELOWEN}`;

async function undone(table: DmTable, token: string, perspective: string) {
  const response = await get(
    table.app,
    `${CAMPAIGN}/undone-actions?perspective=${perspective}`,
    token,
  );
  expect(response.statusCode).toBe(200);
  return { body: response.json<UndoneActionsResponse>(), raw: response.body };
}

/** The camp's name as the player's surroundings and directory say it. */
async function campNames(table: DmTable) {
  const around = await get(table.app, `${CAMPAIGN}/surroundings?${AS_ELOWEN}`, TOKENS.player);
  const known = await get(table.app, `${CAMPAIGN}/entities?${AS_ELOWEN}`, TOKENS.player);
  const here = around.json<SurroundingsResponse>().location;
  return {
    scene: here?.entityId === CAMP ? here.name : 'not here',
    directory:
      known.json<KnownEntitiesResponse>().entities.find((entity) => entity.entityId === CAMP)
        ?.name ?? null,
  };
}

describe('a player’s action undone by the DM', () => {
  it('is named in the DM history, then told to that player alone', async () => {
    const table = await dmTable();
    tables.push(table);
    const { command, page } = table;
    expect(
      (await command({ type: 'AdvanceWorldTime', to: 122_400 }, TOKENS.dm, 'day')).status,
    ).toBe(200);
    const road = { type: 'EnterLocation', characterId: ELOWEN, locationId: 'old-trade-road' };
    expect((await command(road, TOKENS.player, 'road')).result.status).toBe('accepted');
    const examine = {
      type: 'ExamineEntity',
      characterId: ELOWEN,
      entityId: CAMP,
      method: 'inspect',
    };
    expect((await command(examine, TOKENS.player, 'look')).result.status).toBe('accepted');
    const camp = { type: 'EnterLocation', characterId: ELOWEN, locationId: CAMP };
    expect((await command(camp, TOKENS.player, 'camp')).result.status).toBe('accepted');
    // Inside, the place has the name the examination taught, in every projection alike.
    expect(await campNames(table)).toEqual({
      scene: 'Abandoned Caravan Site',
      directory: 'Abandoned Caravan Site',
    });
    // Nothing undone yet: the notice view is empty.
    expect((await undone(table, TOKENS.player, `CHARACTER:${ELOWEN}`)).body.actions).toEqual([]);

    const [day] = (await page()).entries as [DmHistoryEntry];
    expect(day.kind).toBe('world');
    const blockers = day.undo && !day.undo.possible ? day.undo.blockers : [];
    expect(blockers.length).toBeGreaterThan(0);
    const look = blockers.find((blocker) => blocker.commandId === 'http:player-elowen:look');
    expect(look?.player).toEqual({
      character: { entityId: ELOWEN, kind: 'character', name: 'Elowen Starwhisper' },
      command: examine,
    });
    // Every blocker here is Elowen's player's own action, said so.
    for (const blocker of blockers) expect(blocker.player?.character.entityId).toBe(ELOWEN);

    // The DM undoes the examination (the blocker the stand-in met first).
    const back = await command(
      { type: 'UndoCommand', targetCommandId: 'http:player-elowen:look' },
      TOKENS.dm,
    );
    expect(back.result.status).toBe('accepted');
    // The name is forgotten everywhere at once: the scene and the directory agree.
    expect(await campNames(table)).toEqual({ scene: null, directory: null });

    const told = await undone(table, TOKENS.player, `CHARACTER:${ELOWEN}`);
    expect(told.body.actions).toEqual([{ commandId: 'http:player-elowen:look', command: examine }]);
    // The player's own words only: nothing about who undid it, when, or where in the history.
    expect(told.raw).not.toMatch(/dm-ravenford|UndoCommand|sequence|recordedAt|resolution/);
    expect((await undone(table, TOKENS.player, 'PLAYER')).body.actions).toHaveLength(1);

    // Any other view gets nothing: the party's, the public's, the DM's (even holding Elowen's).
    for (const [token, perspective] of [
      [TOKENS.player, 'PARTY'],
      [TOKENS.player, 'PUBLIC'],
      [TOKENS.dm, 'DM'],
      [TOKENS.dm, `CHARACTER:${ELOWEN}`],
    ] as const) {
      expect((await undone(table, token, perspective)).body.actions, perspective).toEqual([]);
    }
    // Another player, even for the same character, has none of Elowen's player's actions.
    const snapshot = await table.engine.load('ravenford');
    const log = new Map(
      (await table.engine.commandLog('ravenford')).map((stored) => [stored.commandId, stored]),
    );
    if (!snapshot) throw new Error('no campaign');
    expect(
      undoneActions(snapshot.state, log, { actorId: 'player-seren', kind: 'user' }, ELOWEN),
    ).toEqual([]);
    expect(
      undoneActions(snapshot.state, log, { actorId: 'player-elowen', kind: 'user' }, ELOWEN),
    ).toHaveLength(1);

    // Once the player acts again, the undo has been played past: it is no longer news.
    const again = await command(examine, TOKENS.player, 'look-again');
    expect(again.result.status).toBe('accepted');
    expect((await undone(table, TOKENS.player, `CHARACTER:${ELOWEN}`)).body.actions).toEqual([]);
  });

  it('never brings back an undo the player has played past, after a later undo', async () => {
    const table = await dmTable();
    tables.push(table);
    const { command } = table;
    const at = (place: string) => ({
      type: 'EnterLocation',
      characterId: ELOWEN,
      locationId: place,
    });
    const listed = async () =>
      (await undone(table, TOKENS.player, `CHARACTER:${ELOWEN}`)).body.actions.map(
        (action) => action.commandId,
      );
    // A, undone; the player goes on with B, so A is no longer news.
    expect((await command(at('north-gate'), TOKENS.player, 'a')).result.status).toBe('accepted');
    const undoA = { type: 'UndoCommand', targetCommandId: 'http:player-elowen:a' };
    expect((await command(undoA, TOKENS.dm)).result.status).toBe('accepted');
    expect(await listed()).toEqual(['http:player-elowen:a']);
    expect((await command(at('orins-alchemy'), TOKENS.player, 'b')).result.status).toBe('accepted');
    expect(await listed()).toEqual([]);
    // B undone: B alone is news; A stays played past.
    const undoB = { type: 'UndoCommand', targetCommandId: 'http:player-elowen:b' };
    expect((await command(undoB, TOKENS.dm)).result.status).toBe('accepted');
    expect(await listed()).toEqual(['http:player-elowen:b']);
  });

  it('names no player, and promises no notice, once the character is released', async () => {
    const table = await dmTable();
    tables.push(table);
    const { command, page } = table;
    expect(
      (await command({ type: 'AdvanceWorldTime', to: 122_400 }, TOKENS.dm, 'day')).status,
    ).toBe(200);
    const road = { type: 'EnterLocation', characterId: ELOWEN, locationId: 'old-trade-road' };
    expect((await command(road, TOKENS.player, 'road')).result.status).toBe('accepted');
    const blockerOf = async () => {
      const [day] = (await page()).entries as [DmHistoryEntry];
      return day.undo && !day.undo.possible ? day.undo.blockers[0] : undefined;
    };
    expect((await blockerOf())?.player?.character.entityId).toBe(ELOWEN);
    // The seat is freed (as a revoked member's is: not through the commands route).
    const released = await table.engine.execute({
      commandId: 'release-elowen',
      campaignId: 'ravenford',
      actor: { actorId: 'dm-ravenford', kind: 'user' },
      command: { type: 'ReleaseCharacter', characterId: ELOWEN },
    });
    expect(released.status).toBe('accepted');
    const blocker = await blockerOf();
    expect(blocker?.commandId).toBe('http:player-elowen:road');
    expect(blocker?.player).toBeUndefined();
  });

  it('is refused to anyone outside the campaign, as every view is', async () => {
    const table = await dmTable();
    tables.push(table);
    const outsider = await get(
      table.app,
      `${CAMPAIGN}/undone-actions?perspective=CHARACTER:${ELOWEN}`,
      TOKENS.outsider,
    );
    expect(outsider.statusCode).toBe(404);
    const anonymous = await get(
      table.app,
      `${CAMPAIGN}/undone-actions?perspective=PARTY`,
      undefined,
    );
    expect(anonymous.statusCode).toBe(401);
  });
});
