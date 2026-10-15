import type { AssetPurpose, CommandResult } from '@ltw/contracts';
import { expect } from 'vitest';

import { authoringWorld, type AuthoringWorld } from '../../authoring/testing/world.ts';
import { MODIFIERS } from '../../investigation/testing/world.ts';
import type { Actor } from '../../kernel/actor.ts';
import { parseRecordedEvent } from '../../kernel/events.ts';
import { replay } from '../../kernel/evolve.ts';
import { checkWorldIntegrity } from '../../kernel/projections/integrity.ts';
import { redecideEffective } from '../../kernel/verification/redecide.ts';
import { CAMPAIGN, DM } from '../../authoring/testing/world.ts';
import { assetIdFor } from '../records.ts';

/**
 * Test support for asset identity (docs/adr/0022-asset-identity.md): the
 * authoring world plus the DM's asset commands and the asset worker's
 * reports, issued as the server would issue them.
 */
export const WORKER: Actor = { actorId: 'asset-worker', kind: 'system' };

/** A distinct, valid content hash per number. */
export const hash = (n: number) => `sha256:${n.toString(16).padStart(64, '0')}`;

export const codeOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.code : result.status;

export interface RequestOptions {
  readonly variant?: 'reference' | 'derived';
  readonly label?: string;
  readonly audience?: 'players' | 'dm';
  readonly purpose?: AssetPurpose;
}

export interface AssetWorld extends AuthoringWorld {
  readonly as: (actor: Actor, command: Record<string, unknown>) => Promise<CommandResult>;
  /** The DM requests an asset; returns the request ID. */
  readonly request: (entityId: string, options?: RequestOptions) => Promise<string>;
  readonly start: (requestId: string) => Promise<CommandResult>;
  readonly complete: (requestId: string, content: number) => Promise<CommandResult>;
  readonly fail: (requestId: string) => Promise<CommandResult>;
  readonly cancel: (requestId: string) => Promise<CommandResult>;
  readonly retract: (assetId: string) => Promise<CommandResult>;
  readonly approve: (assetId: string) => Promise<CommandResult>;
  readonly undo: (targetCommandId: string) => Promise<CommandResult>;
  /** Request, run, and approve an asset; returns its asset ID. */
  readonly approved: (
    entityId: string,
    content: number,
    options?: RequestOptions,
  ) => Promise<string>;
  /** Integrity, the re-decision oracle, and replay from stored JSON all hold. */
  readonly verified: () => Promise<void>;
}

export async function assetWorld(): Promise<AssetWorld> {
  const world = await authoringWorld();
  let counter = 0;
  const as = (actor: Actor, command: Record<string, unknown>) => {
    counter += 1;
    return world.engine.execute({
      commandId: `asset-test.${String(counter)}`,
      campaignId: CAMPAIGN,
      actor,
      command,
    });
  };
  const accepted = async (result: Promise<CommandResult>) => {
    const outcome = await result;
    if (outcome.status !== 'accepted') throw new Error(`rejected: ${codeOf(outcome)}`);
    return outcome;
  };
  const request: AssetWorld['request'] = async (entityId, options = {}) => {
    const result = await accepted(
      as(DM, {
        type: 'RequestAsset',
        entityId,
        variant: options.variant ?? 'reference',
        ...options,
      }),
    );
    return `${result.commandId}#0`;
  };
  const start = (requestId: string) => as(WORKER, { type: 'StartAssetJob', requestId });
  const complete = (requestId: string, content: number) =>
    as(WORKER, {
      type: 'CompleteAssetJob',
      requestId,
      contentHash: hash(content),
      mediaType: 'image/svg+xml',
      generator: { provider: 'local', model: 'placeholder-svg-1' },
    });
  const approve = (assetId: string) => as(DM, { type: 'ApproveAsset', assetId });
  return {
    ...world,
    as,
    request,
    start,
    complete,
    fail: (requestId) => as(WORKER, { type: 'FailAssetJob', requestId, reason: 'PROVIDER_ERROR' }),
    cancel: (requestId) => as(DM, { type: 'CancelAssetRequest', requestId }),
    retract: (assetId) => as(DM, { type: 'RetractAsset', assetId }),
    approve,
    undo: (targetCommandId) => as(DM, { type: 'UndoCommand', targetCommandId }),
    approved: async (entityId, content, options) => {
      const requestId = await request(entityId, options);
      await accepted(start(requestId));
      await accepted(complete(requestId, content));
      await accepted(approve(assetIdFor(requestId)));
      return assetIdFor(requestId);
    },
    verified: async () => {
      const snapshot = await world.engine.load(CAMPAIGN);
      if (!snapshot) throw new Error('missing campaign');
      expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
      const log = await world.engine.commandLog(CAMPAIGN);
      expect(redecideEffective(log, snapshot, (_s, skill) => MODIFIERS[skill] ?? 0)).toBeNull();
      const stored = JSON.parse(JSON.stringify(snapshot.history)) as unknown[];
      expect(replay(stored.map(parseRecordedEvent))).toEqual(snapshot.state);
    },
  };
}
