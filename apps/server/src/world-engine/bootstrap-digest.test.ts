import { parseRecordedEvent, replay } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import {
  bootstrapCommand,
  bootstrapHash,
  OWNER,
} from '../../../../packages/domain/src/campaign/testing/bootstrap.ts';
import {
  createHarness,
  expectAccepted,
} from '../../../../packages/domain/src/kernel/testing/kernel-harness.ts';
import { compareStreams, digestStream } from './replay-digest.ts';
import { canonicalEncoding, stateDigest } from './state-digest.ts';

async function boot() {
  const h = createHarness();
  const command = bootstrapCommand(true);
  expectAccepted(await h.submit(command, { actor: OWNER, commandId: 'boot-digest' }));
  return { ...h, command };
}

describe('bootstrap state and restore digests', () => {
  it('replays complete prepared party and adopted lineage identically after JSON storage and later ordinary play', async () => {
    const f = await boot(),
      snapshot = await f.snapshot();
    const restored = replay(
      snapshot.history.map((event) => parseRecordedEvent(JSON.parse(JSON.stringify(event)))),
    );
    expect(stateDigest(restored)).toBe(stateDigest(snapshot.state));
    const baseline = await digestStream(f.engine, 'test-campaign');
    expect(baseline.digest?.violations).toBe(0);
    if (!baseline.digest) throw new Error('TEST_DIGEST');
    const entityId = f.command.identities.entities['arden'];
    if (!entityId) throw new Error('TEST_ENTITY');
    expectAccepted(
      await f.submit(
        {
          type: 'UpdateEntityProfile',
          entityId,
          description: 'An ordinary correction after publication.',
        },
        { actor: OWNER },
      ),
    );
    expect((await compareStreams(f.engine, [baseline.digest]))[0]).toMatchObject({
      status: 'match',
      version: snapshot.state.version,
      head: snapshot.state.version + 1,
    });
  });

  it('binds provenance, membership and adopted origin but ignores map/set insertion order', async () => {
    const f = await boot(),
      { state } = await f.snapshot(),
      asset = [...state.assets.assets.values()][0];
    if (!state.bootstrap || !state.preparedParty || !asset?.origin)
      throw new Error('TEST_BOOTSTRAP_STATE');
    const digest = stateDigest(state);
    expect(
      stateDigest({
        ...state,
        preparedParty: new Set([...state.preparedParty].reverse()),
        assets: { ...state.assets, assets: new Map([...state.assets.assets].reverse()) },
      }),
    ).toBe(digest);
    const member = [...state.preparedParty][0];
    if (!member) throw new Error('TEST_MEMBER');
    expect(
      stateDigest({
        ...state,
        preparedParty: new Set([...state.preparedParty].filter((id) => id !== member)),
      }),
    ).not.toBe(digest);
    expect(
      stateDigest({
        ...state,
        bootstrap: {
          ...state.bootstrap,
          source: { ...state.bootstrap.source, lockDigest: bootstrapHash(77) },
        },
      }),
    ).not.toBe(digest);
    expect(
      stateDigest({
        ...state,
        bootstrap: {
          ...state.bootstrap,
          confirmation: { ...state.bootstrap.confirmation, reviewDigest: bootstrapHash(78) },
        },
      }),
    ).not.toBe(digest);
    const changed = { ...asset, origin: { ...asset.origin, sourceSignature: bootstrapHash(79) } };
    expect(
      stateDigest({
        ...state,
        assets: {
          ...state.assets,
          assets: new Map(state.assets.assets).set(asset.assetId, changed),
        },
      }),
    ).not.toBe(digest);
  });

  it('refuses to call a truncated initial batch an integrity-clean restore', async () => {
    const f = await boot(),
      snapshot = await f.snapshot(),
      partial = await digestStream(f.engine, 'test-campaign', snapshot.state.version - 1);
    expect(partial.digest?.violations).toBeGreaterThan(0);
    if (!partial.digest) throw new Error('TEST_PARTIAL_DIGEST');
    expect((await compareStreams(f.engine, [partial.digest]))[0]?.status).toBe('inconsistent');
  });

  it('keeps legacy canonical encoding free of optional bootstrap members', async () => {
    const h = createHarness();
    expectAccepted(
      await h.submit({ type: 'CreateCampaign', name: 'Legacy', worldName: 'Legacy', startsAt: 0 }),
    );
    const state = await h.state(),
      withUndefined = structuredClone(state);
    Reflect.set(withUndefined, 'preparedParty', undefined);
    Reflect.set(withUndefined, 'bootstrap', undefined);
    expect(canonicalEncoding(state)).not.toContain('preparedParty');
    expect(canonicalEncoding(state)).not.toContain('bootstrap');
    expect(stateDigest(withUndefined)).toBe(stateDigest(state));
  });
});
