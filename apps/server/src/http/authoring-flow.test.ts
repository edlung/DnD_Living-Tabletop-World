import type {
  AuthoringProposalResponse,
  CommandResult,
  DmIntentResponse,
  KnowledgeListResponse,
  ProposableCommand,
} from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ALL_SECRET_MARKERS,
  TOKENS,
  get,
  post,
  ravenfordApp,
  seededEngine,
} from '../testing/ravenford-app.ts';
import { createdEntityId } from '../testing/scenario/play-day-one.ts';

/**
 * The DM acceptance flow of RAVENFORD_SPEC.md over HTTP (docs/adr/0018-ai-authoring.md):
 * natural language → AI proposal → authoring proposal with preview → edit →
 * confirmation → one World Engine command → Tomas in the world, unseen by
 * players until they meet him → undo with explicit blockers.
 */
const REQUEST = 'Add a young guard near North Gate who saw the caravan leave.';
const PROPOSALS = '/campaigns/ravenford/authoring/proposals';

let engine: WorldEngine;
let app: FastifyInstance;
beforeEach(async () => {
  engine = await seededEngine();
  app = await ravenfordApp(engine);
});

const version = async () => (await engine.load('ravenford'))?.state.version;
const partyKnowledge = async () =>
  (
    await get(app, '/campaigns/ravenford/knowledge?perspective=PARTY', TOKENS.player)
  ).json<KnowledgeListResponse>().knowledge;

async function proposeTomas(): Promise<AuthoringProposalResponse> {
  const intent = (
    await post(app, '/campaigns/ravenford/ai/intents', { text: REQUEST }, TOKENS.dm)
  ).json<DmIntentResponse>();
  expect(intent.status).toBe('PROPOSED');
  const created = await post(app, PROPOSALS, { traceId: intent.traceId }, TOKENS.dm);
  expect(created.statusCode).toBe(201);
  return created.json<AuthoringProposalResponse>();
}

/** The DM's edit: Tomas's age and role, and his willingness to tell what he saw. */
function edited(commands: readonly ProposableCommand[]): ProposableCommand[] {
  const record = commands.find((command) => command.type === 'AddKnowledge');
  if (record?.type !== 'AddKnowledge' || record.knowledgeId === undefined) {
    throw new Error('the stored revision has a resolved record ID');
  }
  return [
    ...commands.map((command) =>
      command.type === 'CreateEntity'
        ? { ...command, description: 'A young guard of the Ravenford Guard, 22 years old.' }
        : command,
    ),
    { type: 'SetDisclosure', knowledgeId: record.knowledgeId, disclosure: 'WILLING' },
  ];
}

describe('DM authoring of Tomas Reed over HTTP', () => {
  it('goes from words to a confirmed, auditable commit, and back by undo', async () => {
    const first = await proposeTomas();
    expect(first.proposal).toMatchObject({ revision: 1, status: 'DRAFT', source: { kind: 'ai' } });
    // The model called him "tomas-reed"; the server's opaque ID replaced it in every command
    // (ADR 0008, Gate 06 remediation).
    const tomas = createdEntityId(first.proposal.commands);
    expect(tomas).not.toMatch(/tomas|reed/);
    expect(JSON.stringify(first.proposal.commands)).not.toContain('tomas-reed');
    expect(first.preview).toMatchObject({
      committable: true,
      issues: [],
      warnings: [],
      risk: { level: 'L2' },
      confirmation: { riskLevel: 'L2', acknowledgedWarnings: [] },
    });
    const { proposalId } = first.proposal;
    const at = `${PROPOSALS}/${proposalId}`;

    // The DM edits; the first preview and its confirmation are void.
    const second = (
      await post(
        app,
        `${at}/revisions`,
        { basedOnRevision: 1, commands: edited(first.proposal.commands) },
        TOKENS.dm,
      )
    ).json<AuthoringProposalResponse>();
    expect(second.proposal.revision).toBe(2);
    expect(second.preview?.changes.map((change) => change.type)).toEqual([
      'EntityCreated',
      'EntityPlaced',
      'KnowledgeAssigned',
      'DisclosureSet',
      'AssetRequested',
    ]);
    const confirmation = second.preview?.confirmation;
    const before = await version();
    expect(
      (await post(app, `${at}/commit`, { revision: 1, confirmation }, TOKENS.dm)).statusCode,
    ).toBe(409);
    expect(await version()).toBe(before);

    // Nothing reaches players before the commit.
    expect(JSON.stringify(await partyKnowledge())).not.toContain(tomas);

    const committed = await post(app, `${at}/commit`, { revision: 2, confirmation }, TOKENS.dm);
    expect(committed.statusCode).toBe(200);
    expect(committed.json<CommandResult>()).toMatchObject({
      status: 'accepted',
      commandId: `authoring.${proposalId}`,
    });
    const viewed = (await get(app, at, TOKENS.dm)).json<AuthoringProposalResponse>();
    expect(viewed).toMatchObject({
      proposal: { status: 'COMMITTED', commit: { revision: 2, undoneBy: null } },
      preview: null,
    });
    expect(viewed.proposal.commit?.events.map((event) => event.type)).toEqual([
      'EntityCreated',
      'EntityPlaced',
      'KnowledgeAssigned',
      'DisclosureSet',
      'AssetRequested',
    ]);

    // Tomas is native to the world; players learn his account only by asking him.
    expect(JSON.stringify(await partyKnowledge())).not.toContain(tomas);
    const enter = {
      type: 'EnterLocation',
      characterId: 'elowen-starwhisper',
      locationId: 'north-gate',
    };
    const ask = {
      type: 'AskAbout',
      characterId: 'elowen-starwhisper',
      npcId: tomas,
      topicId: 'guild-caravan',
    };
    for (const [commandId, command] of [
      ['enter-1', enter],
      ['ask-1', ask],
    ] as const) {
      const result = await post(
        app,
        '/campaigns/ravenford/commands',
        { commandId, command },
        TOKENS.player,
      );
      expect(result.statusCode).toBe(200);
    }
    const told = (await partyKnowledge()).filter((view) => view.attributedTo?.entityId === tomas);
    expect(told).toEqual([
      expect.objectContaining({
        knowledgeType: 'TESTIMONY',
        statement: 'Tomas Reed saw the caravan leave.',
      }),
    ]);
    expect(JSON.stringify(told)).not.toMatch(/authoring|proposal|trace/i);

    // Undo names the conversation that depends on him; the DM undoes it first.
    const blocked = await post(app, `${at}/undo`, {}, TOKENS.dm);
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json<CommandResult>()).toMatchObject({
      code: 'UNDO_UNSAFE',
      details: { blockers: [{ commandId: 'http:player-elowen:ask-1', commandType: 'AskAbout' }] },
    });
    const undoAsk = await post(
      app,
      '/campaigns/ravenford/commands',
      {
        commandId: 'undo-ask-1',
        command: { type: 'UndoCommand', targetCommandId: 'http:player-elowen:ask-1' },
      },
      TOKENS.dm,
    );
    expect(undoAsk.statusCode).toBe(200);
    expect((await post(app, `${at}/undo`, {}, TOKENS.dm)).statusCode).toBe(200);
    const undone = (await get(app, at, TOKENS.dm)).json<AuthoringProposalResponse>();
    expect(undone.proposal).toMatchObject({
      status: 'UNDONE',
      commit: { undoneBy: `authoring.${proposalId}.undo` },
    });
    expect((await partyKnowledge()).some((view) => view.attributedTo?.entityId === tomas)).toBe(
      false,
    );
  });

  it('creates the same IDs from the same trace, so a second proposal of it cannot commit again', async () => {
    const intent = (
      await post(app, '/campaigns/ravenford/ai/intents', { text: REQUEST }, TOKENS.dm)
    ).json<DmIntentResponse>();
    // A retry or a double click: the same trace proposed twice.
    const [first, second] = await Promise.all(
      [1, 2].map(async () =>
        (
          await post(app, PROPOSALS, { traceId: intent.traceId }, TOKENS.dm)
        ).json<AuthoringProposalResponse>(),
      ),
    );
    if (!first || !second) throw new Error('no proposals');
    const created = (response: AuthoringProposalResponse) =>
      response.proposal.commands.filter((command) => command.type === 'CreateEntity');
    expect(created(second)).toEqual(created(first));
    expect(createdEntityId(first.proposal.commands)).toMatch(/^npc-[0-9a-f]{8}$/);

    const commit = (response: AuthoringProposalResponse) =>
      post(
        app,
        `${PROPOSALS}/${response.proposal.proposalId}/commit`,
        { revision: 1, confirmation: response.preview?.confirmation },
        TOKENS.dm,
      );
    expect((await commit(first)).statusCode).toBe(200);
    const again = await commit(second);
    expect(again.statusCode).toBe(422);
    expect(again.json<CommandResult>()).toMatchObject({ status: 'rejected' });
    expect(again.body).toContain('ID_ALREADY_USED');
  });

  it('never shows players a secret through the preview or the proposal', async () => {
    const { proposal } = await proposeTomas();
    const asPlayer = await get(app, `${PROPOSALS}/${proposal.proposalId}`, TOKENS.player);

    expect(asPlayer.statusCode).toBe(403);
    for (const marker of ALL_SECRET_MARKERS) expect(asPlayer.body).not.toContain(marker);
  });
});
