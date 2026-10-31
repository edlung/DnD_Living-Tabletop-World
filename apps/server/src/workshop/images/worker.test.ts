import { describe, expect, it } from 'vitest';

import { deferredImage, draftImageFixture } from '../../testing/draft-image-runtime.ts';
import { DraftImageWorker } from './worker.ts';

describe('private draft image worker', () => {
  it('commits the gate before producing bytes, keeps them unselected and replays without another call', async () => {
    const f = await draftImageFixture(),
      scope = await f.enqueue();
    f.runtime.afterGate = async (lease, call) => {
      expect(
        await f.repository.beginDispatch(lease, {
          chargeId: call.chargeId,
          requestDigest: (await f.repository.get(scope))?.requestDigest ?? '',
        }),
      ).toBe('UNKNOWN');
    };
    const worker = new DraftImageWorker({ repository: f.repository, runtime: f.runtime });
    await worker.run(scope);
    expect((await f.repository.get(scope))?.status).toBe('SUCCEEDED');
    expect(f.runtime.calls).toEqual([scope.jobId]);
    const candidates = await f.repository.candidates(scope, 1, 10);
    expect(candidates).toHaveLength(1);
    expect((await f.repository.manifest(scope, 1))?.entries).toEqual([]);
    const candidate = candidates[0];
    if (!candidate) throw new Error('TEST_CANDIDATE_MISSING');
    expect(
      (await f.repository.content(scope, candidate.contentHash))?.bytes.byteLength,
    ).toBeGreaterThan(0);
    await worker.run(scope);
    expect(f.runtime.calls).toHaveLength(1);
  });

  it('cannot produce a candidate when unavailable or when a scripted runner skips the durable gate', async () => {
    for (const mode of ['unavailable', 'skip-gate']) {
      const f = await draftImageFixture(),
        scope = await f.enqueue();
      f.runtime.available = mode !== 'unavailable';
      f.runtime.skipGate = mode === 'skip-gate';
      await new DraftImageWorker({ repository: f.repository, runtime: f.runtime }).run(scope);
      expect((await f.repository.get(scope))?.status).toBe('FAILED');
      expect(await f.repository.candidates(scope, 1, 10)).toEqual([]);
    }
  });

  it('distinguishes a failure before dispatch from a lost committed dispatch acknowledgement', async () => {
    const before = await draftImageFixture(),
      beforeScope = await before.enqueue();
    before.runtime.beforeGate = () => Promise.reject(new Error('TEST_BEFORE_DISPATCH'));
    await new DraftImageWorker({ repository: before.repository, runtime: before.runtime }).run(
      beforeScope,
    );
    expect((await before.repository.get(beforeScope))?.status).toBe('FAILED');
    expect(before.runtime.calls).toHaveLength(0);
    const after = await draftImageFixture(),
      scope = await after.enqueue();
    const gate = after.repository.beginDispatch.bind(after.repository);
    after.repository.beginDispatch = async (...args) => {
      await gate(...args);
      throw new Error('TEST_LOST_DISPATCH_ACK');
    };
    const worker = new DraftImageWorker({ repository: after.repository, runtime: after.runtime });
    await worker.run(scope);
    after.advance(31000);
    await worker.run(scope);
    expect((await after.repository.get(scope))?.status).toBe('DISPATCH_UNKNOWN');
    expect(after.runtime.calls).toHaveLength(0);
    expect(await after.repository.candidates(scope, 1, 10)).toEqual([]);
  });

  it('never resends an uncertain external result after restart', async () => {
    const f = await draftImageFixture(),
      scope = await f.enqueue();
    f.runtime.afterGate = () => Promise.reject(new Error('TEST_TRANSPORT_LOST'));
    await new DraftImageWorker({ repository: f.repository, runtime: f.runtime }).run(scope);
    f.advance(31000);
    await new DraftImageWorker({ repository: f.repository, runtime: f.runtime }).run(scope);
    expect((await f.repository.get(scope))?.status).toBe('DISPATCH_UNKNOWN');
    expect(f.runtime.calls).toHaveLength(1);
  });

  it('reuses a stored candidate when the completion acknowledgement is lost', async () => {
    const f = await draftImageFixture(),
      scope = await f.enqueue();
    const complete = f.repository.complete.bind(f.repository);
    f.repository.complete = async (...args) => {
      await complete(...args);
      throw new Error('TEST_LOST_RESULT_ACK');
    };
    const worker = new DraftImageWorker({ repository: f.repository, runtime: f.runtime });
    await worker.run(scope);
    f.advance(31000);
    await worker.run(scope);
    expect((await f.repository.get(scope))?.status).toBe('SUCCEEDED');
    expect(await f.repository.candidates(scope, 1, 10)).toHaveLength(1);
    expect(f.runtime.calls).toHaveLength(1);
  });

  it('fences late bytes after explicit cancellation or origin-session revocation', async () => {
    for (const mode of ['cancel', 'revoke']) {
      const f = await draftImageFixture(),
        scope = await f.enqueue(),
        started = deferredImage(),
        pending = deferredImage();
      f.runtime.afterGate = async () => {
        started.release();
        await pending.promise;
      };
      const worker = new DraftImageWorker({ repository: f.repository, runtime: f.runtime });
      const running = worker.run(scope);
      await started.promise;
      if (mode === 'cancel') {
        await f.repository.cancel(scope);
        worker.cancel(scope.jobId);
      } else await f.workshop.revokeOwner(f.ownerId, new Date().toISOString(), 'test:revoke');
      pending.release();
      await running;
      expect(await f.repository.candidates(scope, 1, 10)).toEqual([]);
      expect(f.runtime.calls).toHaveLength(1);
    }
  });

  it('does not attach a late provider result after worker stop aborts its request', async () => {
    const f = await draftImageFixture(),
      scope = await f.enqueue(),
      started = deferredImage(),
      pending = deferredImage();
    f.runtime.afterGate = async () => {
      started.release();
      await pending.promise;
    };
    const worker = new DraftImageWorker({ repository: f.repository, runtime: f.runtime });
    const running = worker.run(scope);
    await started.promise;
    const stopped = worker.stop();
    pending.release();
    await stopped;
    await running;
    expect(await f.repository.candidates(scope, 1, 10)).toEqual([]);
    f.advance(31000);
    await new DraftImageWorker({ repository: f.repository, runtime: f.runtime }).run(scope);
    expect((await f.repository.get(scope))?.status).toBe('FAILED');
    expect(f.runtime.calls).toHaveLength(1);
  });
});
