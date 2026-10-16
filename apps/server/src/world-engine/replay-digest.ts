import { checkWorldIntegrity, replay, type WorldEngine } from '@ltw/domain';
import type pg from 'pg';
import { z } from 'zod';

import { stateDigest } from './state-digest.ts';

/**
 * The restore drill's replay and comparison (docs/adr/0037-deployment.md §4). The event store is
 * canonical: every campaign stream is replayed through the World Engine (which loads and folds
 * every stored event with this build's schemas) and its state digested at a stream version, so a
 * restored database and the live one can be compared at the version the backup holds.
 */
export interface StreamDigest {
  readonly campaignId: string;
  readonly version: number;
  readonly digest: string;
  /** Integrity violations of the replayed state (`checkWorldIntegrity`); any one fails the drill. */
  readonly violations: number;
}

export const streamDigestsSchema = z
  .object({
    streams: z.array(
      z
        .object({
          campaignId: z.string().min(1),
          version: z.number().int().min(1),
          digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
          violations: z.number().int().min(0),
        })
        .strict(),
    ),
  })
  .strict();

export type StreamStatus = 'match' | 'mismatch' | 'missing' | 'behind' | 'inconsistent';

export interface StreamComparison {
  readonly campaignId: string;
  readonly version: number;
  readonly status: StreamStatus;
  readonly expected: string;
  /** The digest here at `version`; null when the stream is missing or shorter. */
  readonly actual: string | null;
  /** This database's head version of the stream; null when it is missing. */
  readonly head: number | null;
}

/** Every campaign stream with its head version, in ID order. */
export async function listStreams(
  pool: pg.Pool,
): Promise<{ readonly campaignId: string; readonly version: number }[]> {
  const { rows } = await pool.query<{ stream_id: string; version: string }>(
    'SELECT stream_id, version FROM ltw_event_streams ORDER BY stream_id',
  );
  return rows.map((row) => ({ campaignId: row.stream_id, version: Number(row.version) }));
}

/**
 * Replays one stream and digests its state at `version` (the head when omitted). Null when the
 * stream does not exist or does not reach `version`; the head version is returned either way.
 */
export async function digestStream(
  engine: WorldEngine,
  campaignId: string,
  version?: number,
): Promise<{ readonly head: number | null; readonly digest: StreamDigest | null }> {
  const snapshot = await engine.load(campaignId);
  if (snapshot === null) return { head: null, digest: null };
  const head = snapshot.state.version;
  const at = version ?? head;
  if (at > head) return { head, digest: null };
  const state = at === head ? snapshot.state : replay(snapshot.history, { untilSequence: at });
  return {
    head,
    digest: {
      campaignId,
      version: at,
      digest: stateDigest(state),
      violations: checkWorldIntegrity(state).length,
    },
  };
}

/** Digests of every stream at its head, or of the given streams at the given versions. */
export async function digestStreams(
  pool: pg.Pool,
  engine: WorldEngine,
  at?: ReadonlyMap<string, number>,
): Promise<StreamDigest[]> {
  const targets =
    at === undefined
      ? await listStreams(pool)
      : [...at].map(([campaignId, version]) => ({ campaignId, version }));
  const digests: StreamDigest[] = [];
  for (const { campaignId, version } of targets) {
    const { digest } = await digestStream(
      engine,
      campaignId,
      at === undefined ? undefined : version,
    );
    if (digest === null) throw new Error(`stream ${campaignId} does not reach version ${version}`);
    digests.push(digest);
  }
  return digests;
}

/** Compares this database's replayed streams with expected digests (from a restored backup). */
export async function compareStreams(
  engine: WorldEngine,
  expected: readonly StreamDigest[],
): Promise<StreamComparison[]> {
  const results: StreamComparison[] = [];
  for (const want of expected) {
    const { head, digest } = await digestStream(engine, want.campaignId, want.version);
    const status: StreamStatus =
      head === null
        ? 'missing'
        : digest === null
          ? 'behind'
          : want.violations > 0 || digest.violations > 0
            ? 'inconsistent'
            : digest.digest === want.digest
              ? 'match'
              : 'mismatch';
    results.push({
      campaignId: want.campaignId,
      version: want.version,
      status,
      expected: want.digest,
      actual: digest?.digest ?? null,
      head,
    });
  }
  return results;
}
