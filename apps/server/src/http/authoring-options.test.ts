import type {
  AuthoringProposalResponse,
  CommandResult,
  KnowledgeListResponse,
} from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import { TOKENS, get, post, ravenfordApp, seededEngine } from '../testing/ravenford-app.ts';

/**
 * Conflict options and relationships over HTTP (docs/adr/0019-continuity-engine.md
 * §1, §3): an option is applied only by the DM's explicit request, as a new
 * revision with a fresh preview; stale or acknowledgement options are refused.
 */
const PROPOSALS = '/campaigns/ravenford/authoring/proposals';
const DAY_0_08 = -57_600;
const DEPARTURE = -154_800;
const WITNESS = 'WITNESS_ELSEWHERE@1:tomas-reed';

const proposal = {
  summary: 'Tomas, who arrived after the caravan left.',
  commands: [
    {
      type: 'CreateEntity',
      entityId: 'tomas-reed',
      kind: 'npc',
      name: 'Tomas Reed',
      existsSince: null,
      placement: { locationId: 'north-gate', since: DAY_0_08 },
    },
    {
      type: 'AddKnowledge',
      knowledgeId: 'tomas-saw',
      scope: { kind: 'NPC', npcId: 'tomas-reed' },
      knowledgeType: 'TESTIMONY',
      statement: 'I saw the caravan leave through the North Gate.',
      subjects: ['guild-caravan', 'north-gate'],
      attributedTo: 'tomas-reed',
      knownSince: DEPARTURE,
    },
    {
      type: 'SetClaim',
      target: { kind: 'knowledge', knowledgeId: 'tomas-saw' },
      claim: { subjectId: 'guild-caravan', aspect: 'departure-time', value: 'before-dawn' },
    },
  ],
};

let engine: WorldEngine;
let app: FastifyInstance;
beforeEach(async () => {
  engine = await seededEngine();
  app = await ravenfordApp(engine);
});

async function draft() {
  const created = await post(app, PROPOSALS, proposal, TOKENS.dm);
  expect(created.statusCode).toBe(201);
  return created.json<AuthoringProposalResponse>();
}

describe('options', () => {
  it('explain each conflict and are applied only on request, as a new revision', async () => {
    const { proposal: first, preview } = await draft();
    const at = `${PROPOSALS}/${first.proposalId}`;
    expect(preview?.warnings.map((warning) => warning.key)).toEqual([
      WITNESS,
      'CLAIM_CONFLICT@2:thorne-departure',
    ]);
    expect(preview?.notes.map((note) => note.code)).toEqual(['CLAIM_AGREES', 'CLAIM_AGREES']);
    const witness = preview?.warnings.find((warning) => warning.key === WITNESS);
    expect(witness?.message).toBe(
      'Tomas Reed was nowhere recorded Day -1 05:00:00, not at North Gate. The world records only where someone is now, not where they were before: tell it in the description, or accept this warning',
    );
    // No option moves Tomas (owner decisions 11, SI-D7): the first makes his account hearsay.
    const [rumor] = witness?.options ?? [];
    expect(rumor).toMatchObject({ optionId: `${WITNESS}/1`, kind: 'edit' });

    // Viewing changes nothing: still revision 1.
    expect(
      (await get(app, at, TOKENS.dm)).json<AuthoringProposalResponse>().proposal.revision,
    ).toBe(1);

    const applied = await post(
      app,
      `${at}/revisions`,
      { basedOnRevision: 1, optionId: rumor?.optionId },
      TOKENS.dm,
    );
    expect(applied.statusCode).toBe(201);
    const second = applied.json<AuthoringProposalResponse>();
    expect(second.proposal).toMatchObject({
      revision: 2,
      appliedOption: { optionId: `${WITNESS}/1`, label: rumor?.label },
    });
    expect(second.proposal.commands[0]).toMatchObject({
      placement: { locationId: 'north-gate', since: DAY_0_08 },
    });
    expect(second.proposal.commands[1]).toMatchObject({ knowledgeType: 'RUMOR' });
    expect(second.preview?.warnings.map((warning) => warning.key)).toEqual([
      'CLAIM_CONFLICT@2:thorne-departure',
    ]);

    const committed = await post(
      app,
      `${at}/commit`,
      { revision: 2, confirmation: second.preview?.confirmation },
      TOKENS.dm,
    );
    expect(committed.json<CommandResult>().status).toBe('accepted');
  });

  it('refuse stale, unknown, and acknowledgement options, and players', async () => {
    const { proposal: first, preview } = await draft();
    const at = `${PROPOSALS}/${first.proposalId}/revisions`;
    const acknowledge = preview?.warnings
      .flatMap((warning) => warning.options ?? [])
      .find((option) => option.kind === 'acknowledge');

    expect(
      (await post(app, at, { basedOnRevision: 1, optionId: 'NOPE@0/1' }, TOKENS.dm)).statusCode,
    ).toBe(409);
    expect(
      (await post(app, at, { basedOnRevision: 1, optionId: acknowledge?.optionId }, TOKENS.dm))
        .statusCode,
    ).toBe(422);
    expect(
      (await post(app, at, { basedOnRevision: 1, optionId: `${WITNESS}/1` }, TOKENS.player))
        .statusCode,
    ).toBe(403);
    expect(
      (await post(app, at, { basedOnRevision: 1, optionId: `${WITNESS}/1` }, TOKENS.dm)).statusCode,
    ).toBe(201);
    expect(
      (await post(app, at, { basedOnRevision: 1, optionId: `${WITNESS}/2` }, TOKENS.dm)).statusCode,
    ).toBe(409);
  });
});

describe('relationships over the command route', () => {
  it('are set by the DM only, and never show in a player view', async () => {
    const command = { type: 'SetRelationship', npcId: 'orin-stonebeard', attitude: 'WARY' };
    const byPlayer = await post(
      app,
      '/campaigns/ravenford/commands',
      { commandId: 'r1', command },
      TOKENS.player,
    );
    const byDm = await post(
      app,
      '/campaigns/ravenford/commands',
      { commandId: 'r1', command },
      TOKENS.dm,
    );

    expect(byPlayer.statusCode).toBe(403);
    expect(byDm.json<CommandResult>()).toMatchObject({
      status: 'accepted',
      events: [{ type: 'RelationshipChanged' }],
    });
    expect((await engine.load('ravenford'))?.state.relationships.get('orin-stonebeard')).toBe(
      'WARY',
    );
    const party = await get(app, '/campaigns/ravenford/knowledge?perspective=PARTY', TOKENS.player);
    expect(JSON.stringify(party.json<KnowledgeListResponse>())).not.toMatch(/WARY|relationship/i);
  });
});
