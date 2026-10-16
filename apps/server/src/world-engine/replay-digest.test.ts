import { replay, type WorldEngine } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { seededEngine } from '../testing/ravenford-app.ts';
import { compareStreams, digestStream, type StreamDigest } from './replay-digest.ts';
import { stateDigest } from './state-digest.ts';

/** The restore drill's replay and comparison over in-memory stores (docs/adr/0037-deployment.md §4). */
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

async function advance(engine: WorldEngine, commandId: string, by: number): Promise<void> {
  const result = await engine.execute({
    commandId,
    campaignId: 'ravenford',
    actor: DM,
    command: { type: 'AdvanceWorldTime', by },
  });
  expect(result.status).toBe('accepted');
}

async function headDigest(engine: WorldEngine): Promise<StreamDigest> {
  const { digest } = await digestStream(engine, 'ravenford');
  if (digest === null) throw new Error('no stream');
  return digest;
}

describe('digestStream', () => {
  it('replays a stream through the World Engine and digests it at its head or an earlier version', async () => {
    const engine = await seededEngine();
    const snapshot = await engine.load('ravenford');
    if (snapshot === null) throw new Error('seed missing');

    const head = await digestStream(engine, 'ravenford');
    expect(head).toEqual({
      head: snapshot.state.version,
      digest: {
        campaignId: 'ravenford',
        version: snapshot.state.version,
        digest: stateDigest(replay(snapshot.history)),
        violations: 0,
      },
    });
    const earlier = await digestStream(engine, 'ravenford', 12);
    expect(earlier.digest?.digest).toBe(
      stateDigest(replay(snapshot.history, { untilSequence: 12 })),
    );
    expect(earlier.head).toBe(snapshot.state.version);
  });

  it('has no digest beyond the head or for a stream that does not exist', async () => {
    const engine = await seededEngine();
    const { version } = await headDigest(engine);

    expect(await digestStream(engine, 'ravenford', version + 1)).toEqual({
      head: version,
      digest: null,
    });
    expect(await digestStream(engine, 'nowhere')).toEqual({ head: null, digest: null });
  });
});

describe('compareStreams', () => {
  it('matches a database that went on after the backup, at the backup’s version', async () => {
    const live = await seededEngine();
    const backup = await headDigest(live);
    await advance(live, 'after-backup', 60);

    expect(await compareStreams(live, [backup])).toEqual([
      {
        campaignId: 'ravenford',
        version: backup.version,
        status: 'match',
        expected: backup.digest,
        actual: backup.digest,
        head: backup.version + 1,
      },
    ]);
  });

  it('reports a different world at the same version, a missing stream and a shorter one', async () => {
    const restored = await seededEngine();
    await advance(restored, 'same-version', 60);
    const expected = await headDigest(restored);
    const other = await seededEngine();
    await advance(other, 'same-version', 120);

    const [mismatch] = await compareStreams(other, [expected]);
    expect(mismatch).toMatchObject({ status: 'mismatch', expected: expected.digest });
    expect(mismatch?.actual).not.toBe(expected.digest);

    const fresh = await seededEngine();
    expect(
      (
        await compareStreams(fresh, [
          { ...expected, campaignId: 'elsewhere' },
          { ...expected, version: expected.version },
        ])
      ).map(({ status, head }) => ({ status, head })),
    ).toEqual([
      { status: 'missing', head: null },
      { status: 'behind', head: expected.version - 1 },
    ]);
  });

  it('never calls an inconsistent replay a match', async () => {
    const live = await seededEngine();
    const expected = await headDigest(live);

    expect((await compareStreams(live, [{ ...expected, violations: 1 }]))[0]?.status).toBe(
      'inconsistent',
    );
  });
});
