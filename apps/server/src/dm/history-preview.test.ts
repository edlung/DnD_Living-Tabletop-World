import type { AuthoringProposalResponse, CommandResult, DmHistoryResponse } from '@ltw/contracts';
import type * as Domain from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fingerprintViews } from '../live/fingerprint.ts';
import { coverageInventory } from '../live/inventory.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { delivered, liveRavenford, readyLive, type LiveStream } from '../testing/live.ts';
import { TOKENS, get, post } from '../testing/ravenford-app.ts';

/**
 * Undo availability in the DM history is decided per entry (docs/adr/0033-live-session.md §7).
 * An authoring commit that creates an NPC and edits him in the same proposal is undoable: its
 * dry decision once threw, failing the page (500) and the DM's live stream (`gone`). And a dry
 * decision that throws is that entry's alone: answered as not possible, logged without world
 * content, while the page and the DM's stream carry on.
 */
const failing = vi.hoisted(() => new Set<string>());
vi.mock('@ltw/domain', async (importOriginal) => {
  const domain = await importOriginal<typeof Domain>();
  return {
    ...domain,
    // Fault injection: the dry decision of a listed command throws, naming world content.
    previewUndo: (...args: Parameters<typeof domain.previewUndo>) => {
      if (failing.has(args[3])) throw new TypeError('entity tomas-reed is missing before');
      return domain.previewUndo(...args);
    },
  };
});

const apps: FastifyInstance[] = [];
afterEach(async () => {
  failing.clear();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const CAMPAIGN = '/campaigns/ravenford';
const DM_LIVE = `${CAMPAIGN}/live?perspective=DM`;
const PROPOSALS = `${CAMPAIGN}/authoring/proposals`;
const TOMAS = {
  type: 'CreateEntity',
  entityId: 'tomas-reed',
  kind: 'npc',
  name: 'Tomas Reed',
  description: 'A young guard.',
  existsSince: null,
  placement: { locationId: 'north-gate', since: null },
};
const ADA = {
  ...TOMAS,
  entityId: 'ada-brook',
  name: 'Ada Brook',
  description: 'A fishmonger.',
  placement: { locationId: 'market-square', since: null },
};
const RENAMED = { type: 'UpdateEntityProfile', entityId: 'tomas-reed', name: 'Tomas the Younger' };

/** Drafts and commits a proposal through the authoring routes; returns the proposal ID. */
async function commit(
  app: FastifyInstance,
  summary: string,
  commands: readonly unknown[],
): Promise<string> {
  const drafted = await post(app, PROPOSALS, { summary, commands }, TOKENS.dm);
  expect(drafted.statusCode).toBe(201);
  const { proposal, preview } = drafted.json<AuthoringProposalResponse>();
  const committed = await post(
    app,
    `${PROPOSALS}/${proposal.proposalId}/commit`,
    { revision: proposal.revision, confirmation: preview?.confirmation },
    TOKENS.dm,
  );
  expect(committed.json<CommandResult>().status).toBe('accepted');
  return proposal.proposalId;
}

async function page(app: FastifyInstance): Promise<DmHistoryResponse> {
  const response = await get(app, `${CAMPAIGN}/dm/history?perspective=DM`, TOKENS.dm);
  expect(response.statusCode).toBe(200);
  return response.json<DmHistoryResponse>();
}

const kinds = (stream: LiveStream) => stream.messages().map((message) => message.type);

/** The DM perspective's views, fingerprinted as the live signal does. */
const dmVerdict = (app: FastifyInstance) =>
  fingerprintViews(
    app,
    `Bearer ${TOKENS.dm}`,
    coverageInventory({
      campaignId: 'ravenford',
      perspective: 'DM',
      kind: 'DM',
      focus: null,
      place: null,
      identity: true,
    }),
  );

describe('undo availability in the DM history', () => {
  it('lists an NPC created and edited by one commit as undoable, and undoes him whole', async () => {
    const world = await liveRavenford();
    apps.push(world.app);
    const open = await readyLive(world.app, DM_LIVE, TOKENS.dm);
    const proposalId = await commit(world.app, 'Tomas, renamed at once.', [TOMAS, RENAMED]);

    expect((await page(world.app)).entries).toEqual([
      expect.objectContaining({
        kind: 'authoring',
        proposalId,
        status: 'COMMITTED',
        undo: { possible: true },
      }),
    ]);
    // The DM's views still fingerprint: the open stream follows, and a new one takes its baseline.
    expect((await dmVerdict(world.app)).kind).toBe('fingerprint');
    await world.hub.cycle();
    await delivered();
    expect(kinds(open)).toEqual(['ready', 'changed']);
    const opened = await readyLive(world.app, DM_LIVE, TOKENS.dm);

    const undone = await post(world.app, `${PROPOSALS}/${proposalId}/undo`, {}, TOKENS.dm);
    expect(undone.json<CommandResult>().status).toBe('accepted');
    expect((await page(world.app)).entries).toEqual([
      expect.objectContaining({ proposalId, status: 'UNDONE', undo: null }),
    ]);
    const entities = await get(world.app, `${CAMPAIGN}/entities?perspective=DM`, TOKENS.dm);
    expect(entities.body).not.toContain('tomas-reed');
    await world.hub.cycle();
    await delivered();
    expect([kinds(open), kinds(opened)]).toEqual([
      ['ready', 'changed', 'changed'],
      ['ready', 'changed'],
    ]);
  });

  it('answers an entry whose dry decision throws as not possible, alone, and logs no world content', async () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: 'dm-history-test',
      level: 'info',
      destination: { write: (chunk: string) => lines.push(chunk) },
    });
    const world = await liveRavenford({ logger });
    apps.push(world.app);
    const open = await readyLive(world.app, DM_LIVE, TOKENS.dm);
    const tomas = await commit(world.app, 'Tomas Reed guards North Gate.', [TOMAS]);
    const ada = await commit(world.app, 'Ada Brook sells fish.', [ADA]);
    failing.add(`authoring.${tomas}`);

    const { entries } = await page(world.app);
    expect(entries).toEqual([
      expect.objectContaining({ proposalId: ada, undo: { possible: true } }),
      expect.objectContaining({
        proposalId: tomas,
        status: 'COMMITTED',
        undo: { possible: false, code: 'UNDO_NOT_SUPPORTED', blockers: [] },
      }),
    ]);
    // The DM's stream, which fingerprints the same page, carries on.
    expect((await dmVerdict(world.app)).kind).toBe('fingerprint');
    await world.hub.cycle();
    await delivered();
    expect(kinds(open)).toEqual(['ready', 'changed']);
    expect(open.ended()).toBe(false);

    const logged = lines.join('\n');
    expect(logged).toContain('dm history undo not decided');
    expect(logged).toContain(`authoring.${tomas}`);
    expect(logged).toContain('TypeError');
    expect(logged).not.toContain('tomas-reed');
    expect(logged).not.toContain('is missing');
  });
});
