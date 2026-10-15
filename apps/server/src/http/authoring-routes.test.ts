import { ProviderError } from '@ltw/ai';
import type { AuthoringProposalResponse, CommandResult, DmIntentResponse } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  TOKENS,
  get,
  post,
  ravenfordApp,
  seededEngine,
  testAiGateway,
  testProvider,
  withoutRequestId,
} from '../testing/ravenford-app.ts';

/**
 * Authoring routes (docs/adr/0018-ai-authoring.md §8): DM only, in the ADR 0009
 * check order; unsupported, illegal, unconfirmed, and stale commits change
 * nothing; and the generic command route cannot commit authoring.
 */
const PROPOSALS = '/campaigns/ravenford/authoring/proposals';
const UNKNOWN = '00000000-0000-4000-8000-00000000ffff';

const tomas = {
  type: 'CreateEntity',
  entityId: 'tomas-reed',
  kind: 'npc',
  name: 'Tomas Reed',
  description: 'A young guard.',
  existsSince: null,
  placement: { locationId: 'north-gate', since: null },
};
const testimony = {
  type: 'AddKnowledge',
  knowledgeId: 'tomas-saw',
  scope: { kind: 'NPC', npcId: 'tomas-reed' },
  knowledgeType: 'TESTIMONY',
  statement: 'I saw the caravan leave.',
  subjects: ['guild-caravan', 'north-gate'],
  attributedTo: 'tomas-reed',
  knownSince: null,
};

let engine: WorldEngine;
let app: FastifyInstance;
beforeEach(async () => {
  engine = await seededEngine();
  app = await ravenfordApp(engine);
});

const version = async () => (await engine.load('ravenford'))?.state.version;

async function draft(commands: unknown[] = [tomas, testimony]) {
  const response = await post(app, PROPOSALS, { summary: 'Tomas.', commands }, TOKENS.dm);
  expect(response.statusCode).toBe(201);
  return response.json<AuthoringProposalResponse>();
}

describe('check order and permission', () => {
  it('answers 401, 400, 404, and 403 in the ADR 0009 order', async () => {
    const { proposal } = await draft();
    const at = `${PROPOSALS}/${proposal.proposalId}`;
    const body = { revision: 1, confirmation: { riskLevel: 'L2', acknowledgedWarnings: [] } };

    expect((await post(app, `${at}/commit`, body)).statusCode).toBe(401);
    expect((await post(app, `${at}/commit`, { revision: 1 }, TOKENS.dm)).statusCode).toBe(400);
    expect((await post(app, `${PROPOSALS}/not-a-uuid/commit`, body, TOKENS.dm)).statusCode).toBe(
      400,
    );
    expect((await post(app, `${at}/commit`, body, TOKENS.outsider)).statusCode).toBe(404);
    expect((await post(app, `${at}/commit`, body, TOKENS.player)).statusCode).toBe(403);
    expect(
      (
        await post(
          app,
          `/campaigns/nowhere/authoring/proposals/${proposal.proposalId}/commit`,
          body,
          TOKENS.dm,
        )
      ).statusCode,
    ).toBe(404);
  });

  it.each([
    ['create', 'POST', PROPOSALS],
    ['view', 'GET', `${PROPOSALS}/${UNKNOWN}`],
    ['revise', 'POST', `${PROPOSALS}/${UNKNOWN}/revisions`],
    ['undo', 'POST', `${PROPOSALS}/${UNKNOWN}/undo`],
  ] as const)('refuses a player on %s', async (_label, method, url) => {
    const payload =
      url === PROPOSALS
        ? { summary: 'x', commands: [tomas] }
        : url.endsWith('/revisions')
          ? { basedOnRevision: 1, commands: [tomas] }
          : {};
    const response =
      method === 'GET'
        ? await get(app, url, TOKENS.player)
        : await post(app, url, payload, TOKENS.player);

    expect(response.statusCode).toBe(403);
  });

  it('refuses ApplyAuthoring through the generic command route, for players and the DM', async () => {
    const before = await version();
    for (const token of [TOKENS.dm, TOKENS.player]) {
      const response = await post(
        app,
        '/campaigns/ravenford/commands',
        {
          commandId: 'sneak',
          command: {
            type: 'ApplyAuthoring',
            proposalId: UNKNOWN,
            revision: 1,
            summary: 'Sneak.',
            source: { kind: 'dm' },
            commands: [tomas],
            confirmation: { riskLevel: 'L3', acknowledgedWarnings: [] },
          },
        },
        token,
      );
      expect(response.statusCode).toBe(400);
    }
    expect(await version()).toBe(before);
  });
});

describe('proposals', () => {
  it('rejects malformed proposals and unknown or unusable traces', async () => {
    const failing = testProvider('remote', 'remote', () =>
      Promise.reject(new ProviderError('TIMEOUT', 'slow')),
    );
    const offline = await ravenfordApp(engine, testAiGateway(failing));
    const unavailable = (
      await post(offline, '/campaigns/ravenford/ai/intents', { text: 'Add a guard.' }, TOKENS.dm)
    ).json<DmIntentResponse>();

    expect((await post(app, PROPOSALS, { summary: 'x', commands: [] }, TOKENS.dm)).statusCode).toBe(
      400,
    );
    expect(
      (
        await post(
          app,
          PROPOSALS,
          { summary: 'x', commands: [{ type: 'UndoCommand', targetCommandId: 'a' }] },
          TOKENS.dm,
        )
      ).statusCode,
    ).toBe(400);
    expect((await post(app, PROPOSALS, { traceId: UNKNOWN }, TOKENS.dm)).statusCode).toBe(404);
    expect(
      (await post(offline, PROPOSALS, { traceId: unavailable.traceId }, TOKENS.dm)).statusCode,
    ).toBe(422);
    // A deliberate decline (ADR 0032, B1) is never an authoring source.
    const declined = (
      await post(app, '/campaigns/ravenford/ai/intents', { text: 'Tell me a joke.' }, TOKENS.dm)
    ).json<DmIntentResponse>();
    expect(declined).toMatchObject({ status: 'INVALID_OUTPUT', issues: ['NO_PROPOSAL'] });
    expect((await post(app, PROPOSALS, { traceId: declined.traceId }, TOKENS.dm)).statusCode).toBe(
      422,
    );
  });

  it('resolves generated IDs when a revision is stored', async () => {
    const { proposal, preview } = await draft([{ ...tomas, entityId: undefined }]);
    const created = proposal.commands[0];

    expect(created?.type === 'CreateEntity' ? created.entityId : null).toMatch(/^[0-9a-f-]{36}$/);
    expect(preview?.changes[0]).toMatchObject({
      type: 'EntityCreated',
      payload: { entityId: created?.type === 'CreateEntity' ? created.entityId : '' },
    });
  });

  it('refuses an edit of a stale revision or of a committed proposal', async () => {
    const { proposal } = await draft();
    const at = `${PROPOSALS}/${proposal.proposalId}`;
    const edit = (basedOnRevision: number) =>
      post(app, `${at}/revisions`, { basedOnRevision, commands: [tomas, testimony] }, TOKENS.dm);

    expect((await edit(1)).statusCode).toBe(201);
    expect((await edit(1)).statusCode).toBe(409);
    const confirmation = { riskLevel: 'L2', acknowledgedWarnings: [] };
    expect(
      (await post(app, `${at}/commit`, { revision: 2, confirmation }, TOKENS.dm)).statusCode,
    ).toBe(200);
    expect((await edit(2)).statusCode).toBe(409);
    // An identical retry is the same command (ADR 0018 §5, G04-M02); any other second commit is not.
    const retried = await post(app, `${at}/commit`, { revision: 2, confirmation }, TOKENS.dm);
    expect([retried.statusCode, retried.json<{ status: string }>().status]).toEqual([
      200,
      'duplicate',
    ]);
    const other = { riskLevel: 'L3', acknowledgedWarnings: [] };
    expect(
      (await post(app, `${at}/commit`, { revision: 2, confirmation: other }, TOKENS.dm)).statusCode,
    ).toBe(409);
  });
});

describe('commits that change nothing', () => {
  it('refuses an unsupported operation, with every issue for the DM', async () => {
    const { proposal, preview } = await draft([
      tomas,
      { type: 'ChangeEntityStatus', entityId: 'orin-stonebeard', status: 'dead' },
    ]);
    expect(preview).toMatchObject({
      committable: false,
      confirmation: null,
      risk: { level: 'L4' },
    });
    const before = await version();
    const response = await post(
      app,
      `${PROPOSALS}/${proposal.proposalId}/commit`,
      { revision: 1, confirmation: { riskLevel: 'L3', acknowledgedWarnings: [] } },
      TOKENS.dm,
    );

    expect(response.statusCode).toBe(422);
    expect(response.json<CommandResult>()).toMatchObject({
      code: 'AUTHORING_UNSUPPORTED',
      details: { issues: [{ commandIndex: 1, code: 'UNSUPPORTED_OPERATION' }] },
    });
    expect(await version()).toBe(before);
    expect((await engine.load('ravenford'))?.state.entities.get('orin-stonebeard')?.status).toBe(
      'active',
    );
  });

  it('needs a confirmation that covers the proposal as it stands at commit', async () => {
    const { proposal, preview } = await draft();
    const at = `${PROPOSALS}/${proposal.proposalId}`;
    const confirmation = preview?.confirmation;
    // Someone else named Tomas Reed appears after the preview.
    await post(
      app,
      '/campaigns/ravenford/commands',
      {
        commandId: 'other-tomas',
        command: { ...tomas, entityId: 'other-tomas', placement: undefined },
      },
      TOKENS.dm,
    );
    const before = await version();
    const stale = await post(app, `${at}/commit`, { revision: 1, confirmation }, TOKENS.dm);

    expect(stale.statusCode).toBe(409);
    expect(stale.json<CommandResult>()).toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
      details: { missing: { warnings: ['NAME_IN_USE@0'] } },
    });
    expect(await version()).toBe(before);

    const fresh = (await get(app, at, TOKENS.dm)).json<AuthoringProposalResponse>();
    expect(fresh.preview?.warnings.map((warning) => warning.key)).toEqual(['NAME_IN_USE@0']);
    const accepted = await post(
      app,
      `${at}/commit`,
      { revision: 1, confirmation: fresh.preview?.confirmation },
      TOKENS.dm,
    );
    expect(accepted.statusCode).toBe(200);
  });

  it('answers 409 for undoing what was never committed', async () => {
    const { proposal } = await draft();

    expect(
      (await post(app, `${PROPOSALS}/${proposal.proposalId}/undo`, {}, TOKENS.dm)).statusCode,
    ).toBe(409);
    expect(withoutRequestId(await get(app, `${PROPOSALS}/${UNKNOWN}`, TOKENS.dm))).toEqual({
      status: 404,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
  });
});
