import type { CommandResult } from '@ltw/contracts';
import { assetIdFor, type Actor, type WorldEngine, type WorldState } from '@ltw/domain';

import type { AssetContentStore } from '../assets/content-store.ts';
import { AssetWorker } from '../assets/worker.ts';
import type { Logger } from '../platform/logging/logger.ts';
import {
  CURATED_PROVIDER,
  createCuratedImageGenerator,
  type CuratedEntry,
  type CuratedSet,
} from './curated-set.ts';

/**
 * Imports the curated Ravenford set into a campaign through real commands (docs/adr/0035-images.md
 * §3; docs/STAGE_330_DESIGN.md): the DM requests each picture (`RequestAsset`, audience players),
 * the asset worker runs those requests with the `curated` generator (`StartAssetJob`,
 * `CompleteAssetJob`), and the DM approves each (`ApproveAsset`). Canonical references first, so
 * that every variant derives from its approved reference.
 *
 * Idempotent: every command ID derives from the campaign, the file and the entity (and the
 * attempt, when a job failed), so a rerun reports duplicates and changes nothing, and a run a crash
 * interrupted is finished. It runs only its own requests and never decides anything the DM did
 * since. Entities the campaign lacks are skipped. Run it while no server's asset worker runs on the
 * campaign (seeding, test servers): that worker would otherwise also pick up a curated job between
 * its start and its completion.
 */
export interface CuratedImportDeps {
  readonly engine: WorldEngine;
  readonly contents: AssetContentStore;
  readonly set: CuratedSet;
  readonly logger: Logger;
}

export interface CuratedImportSummary {
  /** Pictures requested and approved by this run. */
  readonly imported: number;
  /** Pictures an earlier run already imported. */
  readonly present: number;
  /** Pictures of entities the campaign does not have. */
  readonly skipped: number;
}

/** A command of the import that the World Engine refused, or a job that produced no image. */
export class CuratedImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CuratedImportError';
  }
}

/** The audit-trail reason of every command the import issues. */
export const CURATED_REASON = 'Curated Ravenford set (docs/adr/0035-images.md)';

const stemOf = (file: string) => file.replace(/\.webp$/, '');

interface Picture {
  readonly entry: CuratedEntry;
  readonly entityId: string;
  /** The command ID of the picture's first request; later attempts extend it. */
  readonly base: string;
}

/**
 * A job that failed (a storage hiccup, say) or was cancelled settles its request for good, so a
 * picture gets up to three requests, each with its own derived ID: a rerun walks the same ones.
 */
const MAX_ATTEMPTS = 3;
const attemptOf = (base: string, attempt: number) =>
  attempt === 1 ? base : `${base}.attempt-${String(attempt)}`;

/**
 * Whether a curated request is the import's own (`<campaignId>.curated.…`). The server's asset
 * worker leaves these to the import (`AssetWorkerDeps.skip`), so a server running during a seed
 * never generates, or pays for, a curated picture. No HTTP or authoring request ID has the form.
 */
export const isCuratedRequest = (requestId: string, campaignId: string): boolean =>
  requestId.startsWith(`${campaignId}.curated.`);

/** Whether an attempt's job produced the committed curated picture, and nothing else. */
function producedCurated(state: WorldState, commandId: string, entry: CuratedEntry): boolean {
  const requestId = `${commandId}#0`;
  const asset = state.assets.assets.get(assetIdFor(requestId));
  return (
    state.assets.jobs.get(requestId)?.status === 'COMPLETED' &&
    asset?.generator.provider === CURATED_PROVIDER &&
    asset.contentHash === `sha256:${entry.sha256}`
  );
}

/**
 * The picture's attempt still standing: the first whose request has not failed, been cancelled,
 * or completed with anything but the curated picture (a picture nobody reviewed is never
 * approved: it stays a candidate for the DM).
 */
function standingAttempt(state: WorldState, picture: Picture): string | null {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const commandId = attemptOf(picture.base, attempt);
    const requestId = `${commandId}#0`;
    const job = state.assets.jobs.get(requestId);
    const settled =
      job?.status === 'FAILED' ||
      job?.status === 'CANCELLED' ||
      state.assets.requests.get(requestId)?.cancelled === true ||
      (job?.status === 'COMPLETED' && !producedCurated(state, commandId, picture.entry));
    if (!settled) return commandId;
  }
  return null;
}

export async function importCuratedSet(
  deps: CuratedImportDeps,
  campaignId: string,
  dm: Actor,
): Promise<CuratedImportSummary> {
  const summary = { imported: 0, present: 0, skipped: 0 };
  const worker = new AssetWorker({
    engine: deps.engine,
    contents: deps.contents,
    generator: createCuratedImageGenerator(deps.set),
    timeoutMs: 30_000,
    logger: deps.logger,
  });
  const execute = async (commandId: string, command: Record<string, unknown>) => {
    const result: CommandResult = await deps.engine.execute({
      commandId,
      campaignId,
      actor: dm,
      reason: CURATED_REASON,
      command,
    });
    if (result.status === 'rejected') {
      throw new CuratedImportError(`${commandId}: ${command['type'] as string} ${result.code}`);
    }
    return result.status;
  };
  const load = async () => {
    const state = (await deps.engine.load(campaignId))?.state;
    if (!state) throw new CuratedImportError(`no campaign ${campaignId}`);
    return state;
  };

  for (const variant of ['reference', 'derived'] as const) {
    const initial = await load();
    let pending: Picture[] = [];
    for (const entry of deps.set.entries.filter((candidate) => candidate.variant === variant)) {
      for (const entityId of entry.entityIds) {
        if (!initial.entities.has(entityId)) summary.skipped += 1;
        else
          pending.push({
            entry,
            entityId,
            base: `${campaignId}.curated.${stemOf(entry.file)}.${entityId}`,
          });
      }
    }
    // Requested (or found) in this run: whether nothing at all was new for the picture.
    const fresh = new Map<Picture, boolean>();
    for (let round = 1; round <= MAX_ATTEMPTS && pending.length > 0; round += 1) {
      const state = await load();
      const attempts = new Map<Picture, string>();
      for (const picture of pending) {
        const commandId = standingAttempt(state, picture);
        if (commandId === null) {
          throw new CuratedImportError(`${picture.base}: every curated request failed`);
        }
        attempts.set(picture, commandId);
        const { entry, entityId } = picture;
        const requested = await execute(commandId, {
          type: 'RequestAsset',
          entityId,
          variant: entry.variant,
          ...(entry.label === null ? {} : { label: entry.label }),
          ...(entry.purpose === 'image' ? {} : { purpose: entry.purpose }),
          audience: 'players',
        });
        if (requested === 'accepted') fresh.set(picture, true);
      }
      await worker.runOnce(campaignId, new Set([...attempts.values()].map((id) => `${id}#0`)));
      const ran = await load();
      const failed: Picture[] = [];
      for (const picture of pending) {
        const commandId = attempts.get(picture) ?? picture.base;
        const assetId = assetIdFor(`${commandId}#0`);
        if (!producedCurated(ran, commandId, picture.entry)) {
          failed.push(picture);
          continue;
        }
        const approved = await execute(`${commandId}.approve`, { type: 'ApproveAsset', assetId });
        if (approved === 'accepted' || fresh.get(picture) === true) summary.imported += 1;
        else summary.present += 1;
      }
      pending = failed;
    }
    if (pending.length > 0) {
      throw new CuratedImportError(
        `${pending.map(({ base }) => base).join(', ')}: no curated picture produced`,
      );
    }
  }
  return summary;
}
