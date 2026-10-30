import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { MemoryWorkshopStore } from '../../testing/workshop-store.ts';
import {
  emptyCampaignPackage,
  MemoryCampaignRevisionRepository,
} from '../../testing/campaign-packages.ts';
import type { AppendCampaignRevision, AppendCampaignRevisionResult } from './store.ts';

const T0 = '2026-10-30T12:00:00.000Z';
const saved = (result: AppendCampaignRevisionResult) => {
  if (result.kind !== 'saved') throw new Error(`expected saved: ${result.kind}`);
  return result.revision;
};
async function setup() {
  const workshop = new MemoryWorkshopStore();
  const ownerId = randomUUID();
  const other = randomUUID();
  const draftId = randomUUID();
  await workshop.createDraft(
    ownerId,
    { requestId: randomUUID(), title: 'Bell', language: 'ru' },
    draftId,
    T0,
  );
  const repository = new MemoryCampaignRevisionRepository(workshop);
  const input: AppendCampaignRevision = {
    ownerId,
    draftId,
    requestId: randomUUID(),
    basedOnRevision: 0,
    content: emptyCampaignPackage(),
    source: { kind: 'OWNER', actorId: ownerId },
    createdAt: T0,
  };
  return { workshop, repository, ownerId, other, draftId, input };
}

describe('private immutable campaign revisions', () => {
  it('returns nothing to another owner on read, append, list or nonce replay', async () => {
    const t = await setup();
    const first = saved(await t.repository.append(t.input));
    expect(await t.repository.latest(t.other, t.draftId)).toBeNull();
    expect(await t.repository.get(t.other, t.draftId, 1)).toBeNull();
    expect(await t.repository.list(t.other, t.draftId, null, 10)).toEqual([]);
    expect(
      await t.repository.append({
        ...t.input,
        ownerId: t.other,
        source: { kind: 'OWNER', actorId: t.other },
      }),
    ).toEqual({ kind: 'not-found' });
    expect(await t.repository.latest(t.ownerId, t.draftId)).toEqual(first);
  });
  it('keeps canonical IDs across revisions, removal and restoring a key; filters removed keys', async () => {
    const t = await setup();
    t.input.content.entities.push({
      key: 'iva',
      kind: 'npc',
      name: 'Ива',
      description: '',
      status: 'active',
      existsSince: null,
    });
    const first = saved(await t.repository.append(t.input));
    const second = saved(
      await t.repository.append({
        ...t.input,
        requestId: randomUUID(),
        basedOnRevision: 1,
        content: { ...t.input.content, entities: [] },
      }),
    );
    expect(second.identities.entities).toEqual({});
    const restored = saved(
      await t.repository.append({ ...t.input, requestId: randomUUID(), basedOnRevision: 2 }),
    );
    expect(restored.identities.entities['iva']).toBe(first.identities.entities['iva']);
    expect(restored.identities.scene).toBe(first.identities.scene);
    expect(first.identities.entities['iva']).toMatch(/^[0-9a-f-]{36}$/);
    expect(restored.digest).toBe(first.digest);
  });
  it('returns the original exact nonce response after a newer revision and conflicts on changed payload', async () => {
    const t = await setup();
    const first = saved(await t.repository.append(t.input));
    saved(
      await t.repository.append({
        ...t.input,
        requestId: randomUUID(),
        basedOnRevision: 1,
        content: { ...t.input.content, firstSession: ['Changed'] },
      }),
    );
    expect(saved(await t.repository.append(t.input))).toEqual(first);
    expect(
      await t.repository.append({
        ...t.input,
        content: { ...t.input.content, laterOutline: ['Different'] },
      }),
    ).toEqual({ kind: 'conflict', reason: 'REQUEST_REUSED' });
    expect(await t.repository.append({ ...t.input, requestId: randomUUID() })).toEqual({
      kind: 'conflict',
      reason: 'STALE_REVISION',
    });
  });
  it('rejects a reused entity key changing kind without allocating partial new identities', async () => {
    const t = await setup();
    t.input.content.entities.push({
      key: 'iva',
      kind: 'npc',
      name: 'Iva',
      description: '',
      status: 'active',
      existsSince: null,
    });
    const first = saved(await t.repository.append(t.input));
    const changed = structuredClone(t.input.content);
    changed.entities[0] = {
      key: 'iva',
      kind: 'item',
      name: 'A different thing',
      description: '',
      status: 'active',
      existsSince: null,
    };
    changed.entities.push({
      key: 'new-key',
      kind: 'npc',
      name: 'New',
      description: '',
      status: 'active',
      existsSince: null,
    });
    expect(
      await t.repository.append({
        ...t.input,
        requestId: randomUUID(),
        basedOnRevision: 1,
        content: changed,
      }),
    ).toEqual({ kind: 'conflict', reason: 'IDENTITY_KIND_CHANGED' });
    expect(await t.repository.latest(t.ownerId, t.draftId)).toEqual(first);
    expect(await t.repository.list(t.ownerId, t.draftId, null, 10)).toHaveLength(1);
  });
  it('clones stored content and supports exclusive newest-first revision paging', async () => {
    const t = await setup();
    const first = saved(await t.repository.append(t.input));
    first.content.firstSession.push('External mutation');
    expect((await t.repository.get(t.ownerId, t.draftId, 1))?.content.firstSession).toEqual([]);
    saved(await t.repository.append({ ...t.input, requestId: randomUUID(), basedOnRevision: 1 }));
    saved(await t.repository.append({ ...t.input, requestId: randomUUID(), basedOnRevision: 2 }));
    expect((await t.repository.list(t.ownerId, t.draftId, null, 2)).map((r) => r.revision)).toEqual(
      [3, 2],
    );
    expect((await t.repository.list(t.ownerId, t.draftId, 2, 2)).map((r) => r.revision)).toEqual([
      1,
    ]);
  });
  it('cannot assert another owner as provenance or persist a shape-unsafe payload', async () => {
    const t = await setup();
    await expect(
      t.repository.append({ ...t.input, source: { kind: 'OWNER', actorId: t.other } }),
    ).rejects.toThrow('INVALID_CAMPAIGN_REVISION');
    await expect(
      t.repository.append({
        ...t.input,
        content: {
          ...t.input.content,
          world: { ...t.input.content.world, weather: 'magic' },
        } as never,
      }),
    ).rejects.toThrow('INVALID_CAMPAIGN_REVISION');
  });
});
