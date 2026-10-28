import type {
  AuthoringProposalResponse,
  CommandResult,
  OpenProposalsResponse,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import { TOKENS, get, post, ravenfordApp, seededEngine } from '../testing/ravenford-app.ts';

/**
 * The DM's open drafts and the cancel (owner decisions 11, SI-D1; ADR 0029 §6, amendment
 * 2026-10-28): drafts live on the server, so a reload restores the unfinished one. The list is
 * the DM's alone, in the authoring routes' order (401, 400, 404 for a non-member, 403 for a
 * player); it holds drafts only, the most recently changed first; a cancelled draft leaves it
 * and can be neither edited nor committed.
 */
const PROPOSALS = '/campaigns/ravenford/authoring/proposals';

const npc = (entityId: string, name: string) => ({
  type: 'CreateEntity',
  entityId,
  kind: 'npc',
  name,
  description: 'A guard.',
  existsSince: null,
  placement: { locationId: 'north-gate', since: null },
});

let app: FastifyInstance;
beforeEach(async () => {
  app = await ravenfordApp(await seededEngine());
});

async function draft(entityId: string, name: string) {
  const response = await post(
    app,
    PROPOSALS,
    { summary: `${name}.`, commands: [npc(entityId, name)] },
    TOKENS.dm,
  );
  expect(response.statusCode).toBe(201);
  return response.json<AuthoringProposalResponse>().proposal;
}

const open = async () => {
  const response = await get(app, PROPOSALS, TOKENS.dm);
  expect(response.statusCode).toBe(200);
  return response.json<OpenProposalsResponse>().proposals;
};

describe('the open drafts', () => {
  it('are the DM’s alone, refused in the ADR 0009 order with the routes’ fixed bodies', async () => {
    await draft('ada-brook', 'Ada Brook');
    const asOutsider = await get(app, PROPOSALS, TOKENS.outsider);
    const asPlayer = await get(app, PROPOSALS, TOKENS.player);
    const elsewhere = await get(app, '/campaigns/nowhere/authoring/proposals', TOKENS.dm);

    expect((await get(app, PROPOSALS)).statusCode).toBe(401);
    expect(asOutsider.statusCode).toBe(404);
    expect(elsewhere.statusCode).toBe(404);
    // A non-member cannot tell a campaign it is not in from one that does not exist.
    expect(asOutsider.json<{ error: unknown }>().error).toEqual(
      elsewhere.json<{ error: unknown }>().error,
    );
    expect(asPlayer.statusCode).toBe(403);
    expect(asPlayer.json<{ error: unknown }>().error).toEqual({
      code: 'FORBIDDEN',
      message: 'Not permitted',
    });
    for (const body of [asOutsider.body, asPlayer.body, elsewhere.body]) {
      expect(body).not.toContain('Ada Brook');
    }
  });

  it('list drafts only, the most recently changed first', async () => {
    const ada = await draft('ada-brook', 'Ada Brook');
    const bram = await draft('bram-holt', 'Bram Holt');
    const cora = await draft('cora-lane', 'Cora Lane');
    expect((await open()).map((item) => item.proposalId)).toEqual([
      cora.proposalId,
      bram.proposalId,
      ada.proposalId,
    ]);

    // An edit makes Ada's the latest; a commit takes Bram's off the list.
    const edited = await post(
      app,
      `${PROPOSALS}/${ada.proposalId}/revisions`,
      { basedOnRevision: 1, commands: [npc('ada-brook', 'Ada Brook the Elder')] },
      TOKENS.dm,
    );
    expect(edited.statusCode).toBe(201);
    const committed = await post(
      app,
      `${PROPOSALS}/${bram.proposalId}/commit`,
      { revision: 1, confirmation: { riskLevel: 'L2', acknowledgedWarnings: [] } },
      TOKENS.dm,
    );
    expect(committed.json<CommandResult>().status).toBe('accepted');

    expect(await open()).toEqual([
      expect.objectContaining({
        proposalId: ada.proposalId,
        revision: 2,
        summary: 'Ada Brook.',
        source: { kind: 'dm' },
      }),
      expect.objectContaining({ proposalId: cora.proposalId, revision: 1 }),
    ]);
  });

  it('are at most 20, the newest', async () => {
    const made: string[] = [];
    for (let n = 0; n < 25; n += 1) {
      made.push((await draft(`npc-${String(n)}`, `Guard ${String(n)}`)).proposalId);
    }
    expect((await open()).map((item) => item.proposalId)).toEqual(made.slice(5).reverse());
  });

  it('leave out a cancelled draft, which then can be neither edited nor committed', async () => {
    const ada = await draft('ada-brook', 'Ada Brook');
    const at = `${PROPOSALS}/${ada.proposalId}`;
    expect((await post(app, `${at}/cancel`, {}, TOKENS.player)).statusCode).toBe(403);
    expect((await post(app, `${at}/cancel`, {}, TOKENS.outsider)).statusCode).toBe(404);

    const cancelled = await post(app, `${at}/cancel`, {}, TOKENS.dm);
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json<AuthoringProposalResponse>()).toMatchObject({
      proposal: { status: 'CANCELLED', revision: 2 },
      preview: null,
    });
    expect(await open()).toEqual([]);
    // Again: nothing changes.
    expect(
      (await post(app, `${at}/cancel`, {}, TOKENS.dm)).json<AuthoringProposalResponse>().proposal
        .revision,
    ).toBe(2);
    expect(
      (
        await post(
          app,
          `${at}/revisions`,
          { basedOnRevision: 2, commands: [npc('ada-brook', 'Ada')] },
          TOKENS.dm,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await post(
          app,
          `${at}/commit`,
          { revision: 2, confirmation: { riskLevel: 'L2', acknowledgedWarnings: [] } },
          TOKENS.dm,
        )
      ).statusCode,
    ).toBe(409);
    expect((await get(app, at, TOKENS.dm)).json<AuthoringProposalResponse>()).toMatchObject({
      proposal: { status: 'CANCELLED' },
      preview: null,
    });
  });

  it('refuse to cancel a committed proposal', async () => {
    const ada = await draft('ada-brook', 'Ada Brook');
    const at = `${PROPOSALS}/${ada.proposalId}`;
    await post(
      app,
      `${at}/commit`,
      { revision: 1, confirmation: { riskLevel: 'L2', acknowledgedWarnings: [] } },
      TOKENS.dm,
    );
    expect((await post(app, `${at}/cancel`, {}, TOKENS.dm)).statusCode).toBe(409);
    expect((await get(app, at, TOKENS.dm)).json<AuthoringProposalResponse>().proposal.status).toBe(
      'COMMITTED',
    );
  });
});
