import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { TOMAS, confirm, tomasProposal } from '../authoring/testing/world.ts';
import { assetIdFor } from './records.ts';
import { assetLineage } from './views.ts';
import { assetWorld, codeOf, type AssetWorld } from './testing/world.ts';

/**
 * Authoring undo with queued and in-flight asset work (ADR 0006 §9, owner
 * approved: a started external job cannot be recalled; it blocks undo of
 * what it depicts until its outcome is explicitly cancelled or retracted;
 * generated assets are retained for lineage). Every case ends with the
 * integrity check, the re-decision oracle, and replay from stored JSON.
 */
const blockersOf = (result: CommandResult) =>
  result.status === 'rejected'
    ? ((result.details?.['blockers'] ?? []) as { commandId: string; commandType: string }[])
    : [];

async function committedTomas() {
  const world = await assetWorld();
  const result = await world.commit(tomasProposal(), { confirmation: confirm('L2') });
  if (result.status !== 'accepted') throw new Error(`commit ${codeOf(result)}`);
  const state = await world.state();
  const [request] = [...state.assets.requests.values()].filter((r) => r.entityId === TOMAS);
  if (!request) throw new Error('the commit queued no reference');
  return { world, commitId: result.commandId, requestId: request.requestId };
}

const lastCommandOf = async (world: AssetWorld, type: string) => {
  const log = await world.engine.commandLog('ravenford');
  return log.filter((stored) => stored.commandType === type).at(-1)?.commandId;
};

describe('an authoring commit queues references for what it creates', () => {
  it('requests a player reference for the new NPC, sourced from the proposal', async () => {
    const { world, commitId, requestId } = await committedTomas();
    expect(requestId).toBe(`${commitId}#0`);
    expect((await world.state()).assets.requests.get(requestId)).toMatchObject({
      entityId: TOMAS,
      variant: 'reference',
      audience: 'players',
      source: { kind: 'authoring' },
    });
    await world.verified();
  });
});

describe('undoing an authoring commit with asset work', () => {
  it('is allowed while the request is only queued, and removes it', async () => {
    const { world, commitId, requestId } = await committedTomas();
    expect(codeOf(await world.undo(commitId))).toBe('accepted');
    const state = await world.state();
    expect(state.entities.has(TOMAS)).toBe(false);
    expect(state.assets.requests.has(requestId)).toBe(false);
    expect(codeOf(await world.start(requestId))).toBe('INVALID_ASSET');
    await world.verified();
  });

  it('is refused while the job runs, allowed once it is cancelled, and a late image is discarded', async () => {
    const { world, commitId, requestId } = await committedTomas();
    expect(codeOf(await world.start(requestId))).toBe('accepted');

    const refused = await world.undo(commitId);
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(blockersOf(refused)).toEqual([
      expect.objectContaining({
        commandId: await lastCommandOf(world, 'StartAssetJob'),
        commandType: 'StartAssetJob',
      }),
    ]);

    expect(codeOf(await world.cancel(requestId))).toBe('accepted');
    expect(codeOf(await world.undo(commitId))).toBe('accepted');
    // The external job still answers: its image is recorded, discarded, for lineage.
    expect(codeOf(await world.complete(requestId, 7))).toBe('accepted');
    const state = await world.state();
    expect(state.entities.has(TOMAS)).toBe(false);
    expect(state.assets.requests.has(requestId)).toBe(false);
    expect(state.assets.jobs.get(requestId)).toMatchObject({
      entityId: TOMAS,
      status: 'CANCELLED',
    });
    expect(state.assets.assets.get(assetIdFor(requestId))?.status).toBe('DISCARDED');
    expect(codeOf(await world.approve(assetIdFor(requestId)))).toBe('INVALID_ASSET');
    // The DM's lineage still shows the request, from the job's copy of it.
    expect(assetLineage(state).requests).toContainEqual(
      expect.objectContaining({ requestId, entityId: TOMAS, status: 'CANCELLED' }),
    );
    await world.verified();
  });

  it('is allowed after the job failed, keeping the failed job', async () => {
    const { world, commitId, requestId } = await committedTomas();
    await world.start(requestId);
    await world.fail(requestId);
    expect(codeOf(await world.undo(commitId))).toBe('accepted');
    expect((await world.state()).assets.jobs.get(requestId)?.status).toBe('FAILED');
    await world.verified();
  });

  it('is refused while its image stands, approved or not, until the DM retracts it', async () => {
    const { world, commitId, requestId } = await committedTomas();
    await world.start(requestId);
    await world.complete(requestId, 1);
    const assetId = assetIdFor(requestId);

    let refused = await world.undo(commitId);
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(blockersOf(refused).map((b) => b.commandType)).toEqual(['CompleteAssetJob']);

    await world.approve(assetId);
    refused = await world.undo(commitId);
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(blockersOf(refused).map((b) => b.commandType)).toEqual(['ApproveAsset']);

    expect(codeOf(await world.retract(assetId))).toBe('accepted');
    expect(codeOf(await world.undo(commitId))).toBe('accepted');
    const state = await world.state();
    expect(state.entities.has(TOMAS)).toBe(false);
    expect(state.assets.assets.get(assetId)).toMatchObject({
      entityId: TOMAS,
      status: 'RETRACTED',
    });
    expect(state.assets.canonical.has(TOMAS)).toBe(false);
    await world.verified();
  });

  it('is refused while a DM request for the new NPC stands, as any later reader', async () => {
    const { world, commitId } = await committedTomas();
    const extra = await world.request(TOMAS);
    expect(codeOf(await world.undo(commitId))).toBe('UNDO_UNSAFE');
    const requestCommand = extra.slice(0, extra.indexOf('#'));
    expect(codeOf(await world.undo(requestCommand))).toBe('accepted');
    expect(codeOf(await world.undo(commitId))).toBe('accepted');
    await world.verified();
  });
});

describe('undo of asset commands', () => {
  it('never undoes what settles external work', async () => {
    const world = await assetWorld();
    const requestId = await world.request('mira-vale');
    await world.start(requestId);
    await world.complete(requestId, 1);
    await world.retract(assetIdFor(requestId));
    const failed = await world.request('mira-vale');
    await world.start(failed);
    await world.fail(failed);
    const cancelled = await world.request('mira-vale');
    await world.cancel(cancelled);
    for (const type of [
      'StartAssetJob',
      'CompleteAssetJob',
      'FailAssetJob',
      'CancelAssetRequest',
      'RetractAsset',
    ]) {
      const target = await lastCommandOf(world, type);
      expect(target, type).toBeDefined();
      expect(codeOf(await world.undo(target ?? '')), type).toBe('UNDO_NOT_SUPPORTED');
    }
    await world.verified();
  });

  it('undoes a queued request, but not one whose job started', async () => {
    const world = await assetWorld();
    const queued = await world.request('mira-vale');
    expect(codeOf(await world.undo(queued.slice(0, queued.indexOf('#'))))).toBe('accepted');
    expect((await world.state()).assets.requests.has(queued)).toBe(false);

    const started = await world.request('mira-vale');
    await world.start(started);
    const refused = await world.undo(started.slice(0, started.indexOf('#')));
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(blockersOf(refused).map((b) => b.commandType)).toEqual(['StartAssetJob']);
    await world.verified();
  });

  it('undoes an approval, restoring the reference it replaced', async () => {
    const world = await assetWorld();
    const first = await world.approved('mira-vale', 1);
    const second = await world.approved('mira-vale', 2);
    const approval = await lastCommandOf(world, 'ApproveAsset');
    expect(codeOf(await world.undo(approval ?? ''))).toBe('accepted');
    const state = await world.state();
    expect(state.assets.canonical.get('mira-vale')).toBe(first);
    expect(state.assets.assets.get(first)?.status).toBe('CANONICAL');
    expect(state.assets.assets.get(second)?.status).toBe('CANDIDATE');
    await world.verified();
  });

  it('refuses to undo an approval a variant or a retraction relies on', async () => {
    const world = await assetWorld();
    const reference = await world.approved('mira-vale', 1);
    const approval = await lastCommandOf(world, 'ApproveAsset');
    const variant = await world.request('mira-vale', { variant: 'derived', label: 'night' });
    expect(codeOf(await world.undo(approval ?? ''))).toBe('UNDO_UNSAFE');
    expect(codeOf(await world.undo(variant.slice(0, variant.indexOf('#'))))).toBe('accepted');

    await world.retract(reference);
    const refused = await world.undo(approval ?? '');
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(blockersOf(refused).map((b) => b.commandType)).toEqual(['RetractAsset']);
    await world.verified();
  });
});
