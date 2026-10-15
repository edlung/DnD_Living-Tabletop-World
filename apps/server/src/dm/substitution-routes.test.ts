import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import hiddenCharacter from '../../../../tests/e2e/fixtures/hidden-character.json' with { type: 'json' };
import { buildLiveApp } from '../live/live-app.ts';
import { loadDevPersonaAuthenticator } from '../http/auth.ts';
import { DEFAULT_PERSONAS_FILE } from '../platform/config/config.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { CAMPAIGN, ELOWEN, dmTable, type DmTable } from '../testing/dm-table.ts';
import {
  RAVENFORD_QUESTS,
  TOKENS,
  get,
  post,
  seededEngine,
  testAiGateway,
  testAssets,
  testAuthoring,
  testDm,
  withoutRequestId,
} from '../testing/ravenford-app.ts';

/**
 * The DM's reason for acting for a player's character (docs/adr/0033-live-session.md §6;
 * docs/STAGE_310_DESIGN.md §B): `POST …/dm/substitutions` is the DM's alone, in the ADR 0009
 * order with a 404 for everyone else; it records only a reason for a character that has a
 * player, before that command exists, and answers nothing of the world.
 */
const tables: DmTable[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(
    [...tables.splice(0).map((table) => table.app), ...apps.splice(0)].map((app) => app.close()),
  );
});

async function table(): Promise<DmTable> {
  const created = await dmTable();
  tables.push(created);
  return created;
}

const URL = `${CAMPAIGN}/dm/substitutions`;
const valid = { clientCommandId: 'skip-1', characterId: ELOWEN, reason: 'absent' };

describe('check order', () => {
  it('answers 401, then 400, then 404 for a non-member, a player and a missing campaign', async () => {
    const { app, substitute } = await table();
    expect((await post(app, URL, valid)).statusCode).toBe(401);
    expect((await post(app, URL, { reason: 'absent' })).statusCode).toBe(401);
    // Input is validated before membership: a stranger's malformed body is a 400.
    expect((await substitute({ ...valid, reason: 'bored' }, TOKENS.outsider)).statusCode).toBe(400);
    for (const token of [TOKENS.outsider, TOKENS.player]) {
      expect((await substitute(valid, token)).statusCode).toBe(404);
    }
    // The player gets the same 404 for their own character as a stranger gets.
    const own = await substitute({ ...valid, clientCommandId: 'mine' }, TOKENS.player);
    const nowhere = await post(app, '/campaigns/nowhere/dm/substitutions', valid, TOKENS.dm);
    expect(withoutRequestId(own)).toEqual(withoutRequestId(nowhere));
    expect(withoutRequestId(own)).toEqual({
      status: 404,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
  });

  it('refuses malformed input with the fixed 400', async () => {
    const { substitute } = await table();
    for (const body of [
      {},
      { ...valid, clientCommandId: 'has space' },
      { ...valid, clientCommandId: `x${'y'.repeat(64)}` },
      { ...valid, characterId: 'Not-An-Id' },
      { ...valid, reason: 'bored' },
      { ...valid, note: 'n'.repeat(201) },
      { ...valid, note: 7 },
      { ...valid, actorId: 'dm-ravenford' },
      { ...valid, campaignId: 'ravenford' },
    ]) {
      const response = await substitute(body, TOKENS.dm);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
      expect(response.body).not.toContain('bored');
    }
  });
});

describe('recording a reason', () => {
  it('records once for a character with a player and echoes nothing of the world', async () => {
    const { substitute, dm } = await table();
    const note = 'Lost connection, back soon';
    const first = await substitute({ ...valid, reason: 'asked', note: `  ${note} ` }, TOKENS.dm);
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ status: 'recorded' });
    for (const word of [note, 'Elowen', ELOWEN, 'dm-ravenford', 'http:']) {
      expect(first.body).not.toContain(word);
    }
    expect(await dm.substitutions.find('ravenford', 'http:dm-ravenford:skip-1')).toMatchObject({
      characterId: ELOWEN,
      reason: 'asked',
      note,
    });

    const again = await substitute({ ...valid, reason: 'asked', note }, TOKENS.dm);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ status: 'duplicate' });
    const changed = await substitute({ ...valid, reason: 'other', note }, TOKENS.dm);
    expect(withoutRequestId(changed)).toEqual({
      status: 409,
      error: { code: 'CONFLICT', message: 'Conflict' },
    });
  });

  it('keeps notes of up to 200 characters and drops an empty one', async () => {
    const { substitute, dm } = await table();
    const longest = 'n'.repeat(200);
    expect((await substitute({ ...valid, note: longest }, TOKENS.dm)).statusCode).toBe(201);
    expect((await dm.substitutions.find('ravenford', 'http:dm-ravenford:skip-1'))?.note).toBe(
      longest,
    );
    const blank = await substitute({ ...valid, clientCommandId: 'skip-2', note: '   ' }, TOKENS.dm);
    expect(blank.statusCode).toBe(201);
    expect((await dm.substitutions.find('ravenford', 'http:dm-ravenford:skip-2'))?.note).toBeNull();
  });

  it('refuses an unknown character, a character without a player, and a non-character', async () => {
    const { substitute, engine, dm } = await table();
    const created = await engine.execute({
      commandId: 'hidden-character',
      campaignId: 'ravenford',
      actor: { actorId: 'dm-ravenford', kind: 'user' },
      command: hiddenCharacter,
    });
    expect(created.status).toBe('accepted');
    for (const characterId of ['nobody', hiddenCharacter.entityId, 'mira-vale', 'north-gate']) {
      const response = await substitute(
        { ...valid, clientCommandId: `for-${characterId.slice(0, 8)}`, characterId },
        TOKENS.dm,
      );
      expect(withoutRequestId(response), characterId).toEqual({
        status: 422,
        error: { code: 'UNPROCESSABLE', message: 'The command was rejected' },
      });
    }
    expect(
      await dm.substitutions.forCommands('ravenford', ['http:dm-ravenford:for-nobody']),
    ).toEqual(new Map());
  });

  it('comes before its command: a command already stored under that ID is a conflict', async () => {
    const { substitute, command, startAmbush } = await table();
    await startAmbush();
    expect(
      (await command({ type: 'EndTurn', combatantId: ELOWEN }, TOKENS.dm, 'late')).status,
    ).toBe(200);
    const late = await substitute({ ...valid, clientCommandId: 'late' }, TOKENS.dm);
    expect(late.statusCode).toBe(409);
  });

  it('namespaces the command ID by the DM, so a player can never claim it', async () => {
    const { substitute, command, startAmbush, dm } = await table();
    await startAmbush();
    expect((await substitute({ ...valid, clientCommandId: 'turn' }, TOKENS.dm)).statusCode).toBe(
      201,
    );
    // The player's own End turn with the same client ID is the player's command, not the DM's.
    expect(
      (await command({ type: 'EndTurn', combatantId: ELOWEN }, TOKENS.player, 'turn')).status,
    ).toBe(200);
    expect(await dm.substitutions.find('ravenford', 'http:player-elowen:turn')).toBeNull();
  });

  it('changes nothing any perspective reads', async () => {
    const { app, substitute } = await table();
    const views = async () =>
      Promise.all(
        [
          ['entities?perspective=PLAYER', TOKENS.player],
          ['knowledge?perspective=PARTY', TOKENS.player],
          ['encounter?perspective=PLAYER', TOKENS.player],
          ['memories?perspective=PLAYER', TOKENS.player],
          ['session', TOKENS.player],
          ['entities?perspective=DM', TOKENS.dm],
        ].map(async ([path, token]) => (await get(app, `${CAMPAIGN}/${path ?? ''}`, token)).body),
      );
    const before = await views();
    expect((await substitute({ ...valid, note: 'secret aside' }, TOKENS.dm)).statusCode).toBe(201);
    expect(await views()).toEqual(before);
  });
});

it('never logs the note or the character', async () => {
  const lines: string[] = [];
  const { app } = buildLiveApp({
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: testAssets(),
    quests: RAVENFORD_QUESTS,
    engine: await seededEngine(),
    authenticator: await loadDevPersonaAuthenticator(DEFAULT_PERSONAS_FILE),
    logger: createLogger({
      service: 'dm-log-test',
      level: 'info',
      destination: { write: (chunk: string) => lines.push(chunk) },
    }),
  });
  apps.push(app);
  await app.ready();
  const note = 'The player stepped out for tea';
  expect((await post(app, URL, { ...valid, note }, TOKENS.dm)).statusCode).toBe(201);
  const logged = lines.join('\n');
  expect(logged).toContain('dm substitution');
  expect(logged).not.toContain(note);
  expect(logged).not.toContain(ELOWEN);
});
