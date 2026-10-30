import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase } from '../../testing/throwaway-database.ts';
import { emptyCampaignPackage } from '../../testing/campaign-packages.ts';
import { PostgresWorkshopStore } from '../postgres-store.ts';
import { issueWorkshopInvitation } from '../service.ts';
import { PostgresCampaignRevisionRepository } from './postgres-store.ts';
import { campaignContentDigest } from './content.ts';
import type { AppendCampaignRevision, AppendCampaignRevisionResult } from './store.ts';

const T0 = '2026-10-30T12:00:00.000Z';
const cleanup: (() => Promise<unknown>)[] = [];
let pool: pg.Pool;
let repository: PostgresCampaignRevisionRepository;
let workshop: PostgresWorkshopStore;
beforeEach(async () => {
  const database = await createThrowawayDatabase({ migrate: true });
  cleanup.push(() => database.drop());
  pool = new pg.Pool({ connectionString: database.url, max: 4 });
  const connections = pool;
  cleanup.push(() => connections.end());
  workshop = new PostgresWorkshopStore(pool);
  repository = new PostgresCampaignRevisionRepository(pool);
});
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const saved = (result: AppendCampaignRevisionResult) => {
  if (result.kind !== 'saved') throw new Error(`expected saved: ${result.kind}`);
  return result.revision;
};
async function input(): Promise<AppendCampaignRevision> {
  const ownerId = randomUUID();
  const draftId = randomUUID();
  await issueWorkshopInvitation(
    {
      store: workshop,
      publicOrigin: 'https://table.example',
      clock: { now: () => Date.parse(T0) },
    },
    { ownerId, hours: 24, authorizationSource: 'test:390' },
  );
  await workshop.createDraft(
    ownerId,
    { requestId: randomUUID(), title: 'Bell', language: 'ru' },
    draftId,
    T0,
  );
  const content = emptyCampaignPackage();
  content.entities.push({
    key: 'iva',
    kind: 'npc',
    name: 'Ива',
    description: '',
    status: 'active',
    existsSince: null,
  });
  return {
    ownerId,
    draftId,
    requestId: randomUUID(),
    basedOnRevision: 0,
    content,
    source: { kind: 'OWNER', actorId: ownerId },
    createdAt: T0,
  };
}

describe('PostgreSQL campaign revisions', () => {
  it('persists source, canonical identities, exact digest and contents through a store restart', async () => {
    const request = await input();
    const first = saved(await repository.append(request));
    const restarted = new PostgresCampaignRevisionRepository(pool);
    expect(await restarted.get(request.ownerId, request.draftId, 1)).toEqual(first);
    expect(first.digest).toBe(campaignContentDigest(first.content, first.identities));
    expect(first.source).toEqual({ kind: 'OWNER', actorId: request.ownerId });
    expect(first.identities.entities['iva']).toMatch(/^[0-9a-f-]{36}$/);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM ltw_events')).rows[0]).toEqual({
      n: 0,
    });
  });

  it('serializes competing base revisions and stores only the winner identities', async () => {
    const request = await input();
    const other = {
      ...request,
      requestId: randomUUID(),
      content: structuredClone(request.content),
    };
    other.content.entities[0] = {
      key: 'nera',
      kind: 'npc',
      name: 'Нера',
      description: '',
      status: 'active',
      existsSince: null,
    };
    const results = await Promise.all([
      repository.append(request),
      new PostgresCampaignRevisionRepository(pool).append(other),
    ]);
    expect(results.filter((result) => result.kind === 'saved')).toHaveLength(1);
    expect(results.filter((result) => result.kind === 'conflict')).toEqual([
      { kind: 'conflict', reason: 'STALE_REVISION' },
    ]);
    expect(
      (await pool.query('SELECT COUNT(*)::int AS n FROM ltw_campaign_package_identities')).rows[0],
    ).toEqual({ n: 2 });
    expect(
      (await pool.query('SELECT COUNT(*)::int AS n FROM ltw_campaign_package_revisions')).rows[0],
    ).toEqual({ n: 1 });
  });

  it('converges nonce retries across connections and returns that revision after later edits', async () => {
    const request = await input();
    const [a, b] = await Promise.all([
      repository.append(request),
      new PostgresCampaignRevisionRepository(pool).append({
        ...request,
        createdAt: '2026-10-30T12:01:00.000Z',
      }),
    ]);
    const first = saved(a);
    expect(saved(b)).toEqual(first);
    saved(
      await repository.append({
        ...request,
        requestId: randomUUID(),
        basedOnRevision: 1,
        content: { ...request.content, firstSession: ['Changed'] },
      }),
    );
    expect(saved(await repository.append(request))).toEqual(first);
    expect(
      await repository.append({
        ...request,
        content: { ...request.content, laterOutline: ['Changed'] },
      }),
    ).toEqual({ kind: 'conflict', reason: 'REQUEST_REUSED' });
    expect(
      (await repository.list(request.ownerId, request.draftId, null, 1)).map(
        (revision) => revision.revision,
      ),
    ).toEqual([2]);
    expect(
      (await repository.list(request.ownerId, request.draftId, 2, 10)).map(
        (revision) => revision.revision,
      ),
    ).toEqual([1]);
  });

  it('retains removed identities and rejects changing kind without partially allocating', async () => {
    const request = await input();
    const first = saved(await repository.append(request));
    const bad = structuredClone(request.content);
    bad.entities.unshift({
      key: 'allocated-first',
      kind: 'npc',
      name: 'New',
      description: '',
      status: 'active',
      existsSince: null,
    });
    bad.entities[1] = {
      key: 'iva',
      kind: 'item',
      name: 'Not Iva',
      description: '',
      status: 'active',
      existsSince: null,
    };
    expect(
      await repository.append({
        ...request,
        requestId: randomUUID(),
        basedOnRevision: 1,
        content: bad,
      }),
    ).toEqual({ kind: 'conflict', reason: 'IDENTITY_KIND_CHANGED' });
    expect(
      (await pool.query('SELECT COUNT(*)::int AS n FROM ltw_campaign_package_identities')).rows[0],
    ).toEqual({ n: 2 });
    const removed = saved(
      await repository.append({
        ...request,
        requestId: randomUUID(),
        basedOnRevision: 1,
        content: { ...request.content, entities: [] },
      }),
    );
    expect(removed.identities.entities).toEqual({});
    const restored = saved(
      await repository.append({ ...request, requestId: randomUUID(), basedOnRevision: 2 }),
    );
    expect(restored.identities).toEqual(first.identities);
    expect(restored.digest).toBe(first.digest);
  });

  it('has identical absence for every cross-owner operation, including known request IDs', async () => {
    const a = await input();
    const b = await input();
    const first = saved(await repository.append(a));
    expect(await repository.get(b.ownerId, a.draftId, 1)).toBeNull();
    expect(await repository.latest(b.ownerId, a.draftId)).toBeNull();
    expect(await repository.list(b.ownerId, a.draftId, null, 50)).toEqual([]);
    expect(await repository.append({ ...a, ownerId: b.ownerId, source: b.source })).toEqual({
      kind: 'not-found',
    });
    expect(await repository.latest(a.ownerId, a.draftId)).toEqual(first);
  });

  it('forbids updates, deletes and truncation of revisions/identity history', async () => {
    const request = await input();
    const first = saved(await repository.append(request));
    for (const sql of [
      "UPDATE ltw_campaign_package_revisions SET content = '{}'::jsonb",
      'DELETE FROM ltw_campaign_package_revisions',
      'TRUNCATE ltw_campaign_package_revisions',
      'UPDATE ltw_campaign_package_identities SET canonical_id = gen_random_uuid()',
      'DELETE FROM ltw_campaign_package_identities',
      'TRUNCATE ltw_campaign_package_identities',
    ])
      await expect(pool.query(sql)).rejects.toThrow();
    expect(await repository.latest(request.ownerId, request.draftId)).toEqual(first);
  });

  it('detects a corrupted persisted package and emits a fixed storage error', async () => {
    const request = await input();
    saved(await repository.append(request));
    await pool.query(
      'ALTER TABLE ltw_campaign_package_revisions DISABLE TRIGGER ltw_campaign_package_revisions_immutable',
    );
    await pool.query(
      `UPDATE ltw_campaign_package_revisions SET content = jsonb_set(content, '{world,name}', '"Corrupted"')`,
    );
    await pool.query(
      'ALTER TABLE ltw_campaign_package_revisions ENABLE TRIGGER ltw_campaign_package_revisions_immutable',
    );
    await expect(repository.latest(request.ownerId, request.draftId)).rejects.toThrow(
      'CAMPAIGN_PACKAGE_STORAGE_UNAVAILABLE',
    );
  });
});
