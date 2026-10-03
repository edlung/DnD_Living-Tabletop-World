import type { CommandResult, KnowledgeListResponse } from '@ltw/contracts';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TOKENS, get, ravenfordApp, withoutRequestId } from '../testing/ravenford-app.ts';

let app: FastifyInstance;
const URL = '/campaigns/ravenford/commands';

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  await app.close();
});

const post = (
  body: unknown,
  token?: string,
  contentType = 'application/json',
): Promise<LightMyRequestResponse> =>
  app.inject({
    method: 'POST',
    url: URL,
    headers: {
      'content-type': contentType,
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    payload: typeof body === 'string' ? body : JSON.stringify(body),
  });

const secretForParty = {
  type: 'AddKnowledge',
  knowledgeId: 'party-new-clue',
  scope: { kind: 'PARTY' },
  knowledgeType: 'EVIDENCE',
  statement: 'Fresh wagon ruts lead north.',
  subjects: ['old-trade-road'],
  knownSince: null,
};

describe('POST /campaigns/:campaignId/commands', () => {
  it('lets the DM author knowledge, visible only where it was assigned', async () => {
    const response = await post(
      { commandId: 'clue-1', command: secretForParty, reason: 'Session note' },
      TOKENS.dm,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json<CommandResult>()).toMatchObject({
      status: 'accepted',
      commandId: 'http:dm-ravenford:clue-1',
      events: [{ type: 'KnowledgeAssigned' }],
    });
    const party = await get(app, '/campaigns/ravenford/knowledge?perspective=PARTY', TOKENS.player);
    expect(party.json<KnowledgeListResponse>().knowledge.map((v) => v.knowledgeId)).toContain(
      'party-new-clue',
    );
    const mira = await get(
      app,
      '/campaigns/ravenford/knowledge?perspective=NPC:mira-vale',
      TOKENS.dm,
    );
    expect(mira.body).not.toContain('party-new-clue');
  });

  it('refuses players with a generic 403 and writes nothing (player assigning WORLD_TRUTH)', async () => {
    const response = await post(
      {
        commandId: 'mine',
        command: { ...secretForParty, scope: { kind: 'WORLD_TRUTH' }, knowledgeType: 'FACT' },
      },
      TOKENS.player,
    );

    expect(withoutRequestId(response)).toEqual({
      status: 403,
      error: { code: 'FORBIDDEN', message: 'Not permitted' },
    });
    const dm = await get(
      app,
      '/campaigns/ravenford/knowledge/party-new-clue?perspective=DM',
      TOKENS.dm,
    );
    expect(dm.statusCode).toBe(404);
  });

  it('hides the campaign from outsiders and rejects anonymous callers', async () => {
    const outsider = withoutRequestId(
      await post({ commandId: 'x', command: secretForParty }, TOKENS.outsider),
    );
    const missing = withoutRequestId(
      await app.inject({
        method: 'POST',
        url: '/campaigns/no-such-campaign/commands',
        headers: { authorization: `Bearer ${TOKENS.outsider}`, 'content-type': 'application/json' },
        payload: JSON.stringify({ commandId: 'x', command: secretForParty }),
      }),
    );
    expect(outsider).toEqual({ status: 404, error: { code: 'NOT_FOUND', message: 'Not found' } });
    expect(missing).toEqual(outsider);
    expect((await post({ commandId: 'x', command: secretForParty })).statusCode).toBe(401);
  });

  it.each([
    [
      'actor in body',
      {
        commandId: 'a',
        command: secretForParty,
        actor: { actorId: 'dm-ravenford', kind: 'system' },
      },
    ],
    ['campaign in body', { commandId: 'a', command: secretForParty, campaignId: 'other' }],
    [
      'CreateCampaign',
      {
        commandId: 'a',
        command: { type: 'CreateCampaign', name: 'X', worldName: 'X', startsAt: 0 },
      },
    ],
    ['bad command id', { commandId: 'http:dm-ravenford:x', command: secretForParty }],
    ['missing command', { commandId: 'a' }],
    ['array body', [{ commandId: 'a', command: secretForParty }]],
  ])('rejects %s as 400', async (_label, body) => {
    expect((await post(body, TOKENS.dm)).statusCode).toBe(400);
  });

  it.each([
    ['text/plain', 'text/plain'],
    ['invalid JSON', 'application/json'],
  ])('rejects %s bodies', async (_label, contentType) => {
    const response = await post('{"commandId": "a", "command": {', TOKENS.dm, contentType);
    expect(withoutRequestId(response)).toEqual({
      status: 400,
      error: { code: 'INVALID_REQUEST', message: 'The request is invalid' },
    });
  });

  it('rejects prototype-poisoning payloads', async () => {
    const response = await post(
      '{"commandId":"a","command":{"type":"AddKnowledge"},"__proto__":{"kind":"system"}}',
      TOKENS.dm,
    );
    expect(response.statusCode).toBe(400);
  });

  it('namespaces command IDs per actor, so callers cannot probe others', async () => {
    const seedCommandId = 'ravenford.knowledge.0030';
    const probe = await post({ commandId: seedCommandId, command: secretForParty }, TOKENS.player);
    const fresh = await post(
      { commandId: 'never-used-anywhere', command: secretForParty },
      TOKENS.player,
    );
    expect(withoutRequestId(probe)).toEqual(withoutRequestId(fresh));

    const first = await post({ commandId: seedCommandId, command: secretForParty }, TOKENS.dm);
    expect(first.json<CommandResult>()).toMatchObject({
      status: 'accepted',
      commandId: `http:dm-ravenford:${seedCommandId}`,
    });
    const again = await post({ commandId: seedCommandId, command: secretForParty }, TOKENS.dm);
    expect(again.json<CommandResult>().status).toBe('duplicate');
    const changed = await post(
      { commandId: seedCommandId, command: { ...secretForParty, statement: 'Other' } },
      TOKENS.dm,
    );
    expect(changed.statusCode).toBe(409);
  });

  it('undoes an HTTP command by its namespaced ID', async () => {
    expect((await post({ commandId: 'clue', command: secretForParty }, TOKENS.dm)).statusCode).toBe(
      200,
    );
    const undo = await post(
      {
        commandId: 'undo-clue',
        command: { type: 'UndoCommand', targetCommandId: 'http:dm-ravenford:clue' },
      },
      TOKENS.dm,
    );
    expect(undo.json<CommandResult>()).toMatchObject({ status: 'accepted' });
    const party = await get(
      app,
      '/campaigns/ravenford/knowledge/party-new-clue?perspective=PARTY',
      TOKENS.player,
    );
    expect(party.statusCode).toBe(404);
  });

  it('returns domain rejections to the DM with their reason', async () => {
    const response = await post(
      { commandId: 'bad', command: { ...secretForParty, subjects: ['no-such-entity'] } },
      TOKENS.dm,
    );
    expect(response.statusCode).toBe(422);
    expect(response.json<CommandResult>()).toMatchObject({
      status: 'rejected',
      code: 'ENTITY_NOT_FOUND',
    });
  });
});
