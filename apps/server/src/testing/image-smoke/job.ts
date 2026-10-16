import { createHash } from 'node:crypto';

import { PLACEHOLDER_MODEL } from '@ltw/ai';
import type {
  AssetFailure,
  AssetLineageResponse,
  AssetRequestStatus,
  AssetView,
} from '@ltw/contracts';

import { formatDollars } from '../../ai/accounting/money.ts';
import type { ImageChargeRecord } from '../../images/ledger-operator.ts';
import { IMAGE_MODELS, OPENROUTER_OPENAI_PROVIDER, isImageModel } from '../../images/models.ts';
import { SmokeFailure, campaignPath, expectStatus, type SmokeContext } from './client.ts';

/**
 * The image job (`../image-smoke.ts`): the DM's lineage polled until the request completes or
 * fails within the bounded wait; then the picture as the DM receives it and as it is stored, and
 * the image ledger's reservations for the request (the operator's view: no DM view shows amounts).
 */
export type JobOutcome =
  | { readonly status: 'COMPLETED'; readonly asset: AssetView; readonly elapsedMs: number }
  | {
      readonly status: 'FAILED' | 'CANCELLED';
      readonly failure: AssetFailure | null;
      readonly elapsedMs: number;
    };

export async function awaitJob(context: SmokeContext, requestId: string): Promise<JobOutcome> {
  const { client, options, log, now, sleep } = context;
  const started = now();
  let last: AssetRequestStatus | null = null;
  for (;;) {
    const lineage = await expectStatus<AssetLineageResponse>(
      client.get('dm', campaignPath(context, '/assets')),
      200,
      'DM asset lineage',
    );
    const request = lineage.requests.find((candidate) => candidate.requestId === requestId);
    if (!request) throw new SmokeFailure(`the request ${requestId} left the lineage`);
    const elapsedMs = now() - started;
    if (request.status !== last) {
      log(`[job] ${request.status} after ${String(Math.round(elapsedMs / 1_000))} s`);
      last = request.status;
    }
    if (request.status === 'COMPLETED') {
      const asset = lineage.assets.find((candidate) => candidate.requestId === requestId);
      if (!asset) throw new SmokeFailure('the job completed without an asset in the lineage');
      return { status: 'COMPLETED', asset, elapsedMs };
    }
    if (request.status === 'FAILED' || request.status === 'CANCELLED') {
      return { status: request.status, failure: request.failure, elapsedMs };
    }
    if (elapsedMs >= options.timeoutMs) {
      throw new SmokeFailure(
        `the job is still ${request.status} after ${String(Math.round(elapsedMs / 1_000))} s; ` +
          'the server keeps it: check again with the DM lineage before anything else',
      );
    }
    await sleep(options.pollMs);
  }
}

export interface PictureReport {
  readonly contentHash: string;
  readonly mediaType: string;
  readonly size: number;
}

const WEBP_LIMIT = 1.5 * 1024 * 1024;
const isWebp = (bytes: Uint8Array) =>
  Buffer.from(bytes.subarray(0, 4)).toString('latin1') === 'RIFF' &&
  Buffer.from(bytes.subarray(8, 12)).toString('latin1') === 'WEBP';

export const contentHashOf = (bytes: Uint8Array) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** The produced picture: by its generator, as the DM receives it, and as it is stored. */
export async function inspectPicture(
  context: SmokeContext,
  asset: AssetView,
): Promise<PictureReport> {
  const { client, options, store } = context;
  if (asset.status !== 'CANDIDATE') {
    throw new SmokeFailure(`the new picture is ${asset.status}, not a candidate for the DM`);
  }
  const expected =
    options.generator === 'placeholder'
      ? asset.generator.provider === 'local' && asset.generator.model === PLACEHOLDER_MODEL
      : asset.generator.provider === OPENROUTER_OPENAI_PROVIDER &&
        isImageModel(asset.generator.model);
  if (!expected) {
    throw new SmokeFailure(
      `the picture came from ${asset.generator.provider}/${asset.generator.model}, not the ` +
        `${options.generator} generator: is another server running against this database?`,
    );
  }
  const reply = await client.get(
    'dm',
    campaignPath(context, `/assets/content/${asset.contentHash}?perspective=DM`),
  );
  if (reply.status !== 200)
    throw new SmokeFailure(`the DM cannot open the picture (${String(reply.status)})`);
  const hash = contentHashOf(reply.bytes);
  if (hash !== asset.contentHash) throw new SmokeFailure(`the served bytes hash to ${hash}`);
  if (reply.contentType !== asset.mediaType) {
    throw new SmokeFailure(
      `served as ${String(reply.contentType)}, recorded as ${asset.mediaType}`,
    );
  }
  const stored = await store.storedContent(options.campaignId, asset.contentHash);
  if (stored?.size !== reply.bytes.byteLength || stored.mediaType !== asset.mediaType) {
    throw new SmokeFailure('the stored picture differs from the served one');
  }
  if (options.generator === 'openrouter-openai') {
    if (asset.mediaType !== 'image/webp' || !isWebp(reply.bytes)) {
      throw new SmokeFailure('the provider picture was not stored as WebP');
    }
    if (reply.bytes.byteLength > WEBP_LIMIT) {
      throw new SmokeFailure('the provider picture is larger than 1.5 MB');
    }
  }
  return { contentHash: hash, mediaType: asset.mediaType, size: reply.bytes.byteLength };
}

export interface LedgerReport {
  readonly charges: readonly ImageChargeRecord[];
  readonly lines: readonly string[];
}

const usd = (micros: string) => formatDollars(BigInt(micros));

export function chargeLine(charge: ImageChargeRecord): string {
  const reserved = `reserved ${usd(charge.reservedMicros)} for ${charge.model} (${charge.chargeId})`;
  const { settlement } = charge;
  if (settlement === null) return `${reserved}; NOT SETTLED (held whole)`;
  const basis = settlement.costReported
    ? 'cost reported by the provider'
    : settlement.outcome === 'orphaned'
      ? 'settled by the operator'
      : settlement.outcome === 'not-sent'
        ? 'never sent'
        : 'no cost reported: the whole reservation';
  const generation =
    settlement.providerRequestId === null ? '' : `, generation ${settlement.providerRequestId}`;
  return `${reserved}; settled ${settlement.outcome} at ${usd(settlement.chargedMicros)} (${basis}${generation})`;
}

/**
 * The request's reservations. A paid generator makes one per call: the last one must be settled
 * as `generated`; earlier ones are a retried job's. The placeholder makes none.
 */
export async function ledgerFor(context: SmokeContext, requestId: string): Promise<LedgerReport> {
  const { options, store } = context;
  const charges = await store.charges(options.campaignId, requestId);
  if (options.generator === 'placeholder') {
    if (charges.length > 0) throw new SmokeFailure('the placeholder generator made a reservation');
    return { charges, lines: ['no reservation: the placeholder makes no provider call'] };
  }
  const last = charges.at(-1);
  if (last?.settlement?.outcome !== 'generated') {
    throw new SmokeFailure(
      charges.length === 0
        ? 'no reservation for the job in the ledger the smoke reads'
        : 'the last reservation for the job is not settled as generated',
    );
  }
  if (
    !isImageModel(last.model) ||
    BigInt(last.reservedMicros) !== IMAGE_MODELS[last.model].reserveMicros
  ) {
    throw new SmokeFailure(`the reservation does not match the allowlisted model ${last.model}`);
  }
  return { charges, lines: charges.map(chargeLine) };
}
