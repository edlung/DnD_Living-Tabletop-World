import { randomUUID } from 'node:crypto';

import {
  buildCampaignEditPlan,
  campaignEditTargets,
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  WorldEngine,
} from '@ltw/domain';
import { createCombatEngine } from '@ltw/combat';
import { afterEach, describe, expect, it } from 'vitest';

import { InMemoryCredentialStore } from '../auth/credential-store.ts';
import { hashToken, newToken } from '../auth/tokens.ts';
import { CampaignEditWorker } from '../workshop/generation/edit-worker.ts';
import { MemoryCampaignRevisionRepository } from './campaign-packages.ts';
import { MemoryDraftImageRepository } from './draft-image-store.ts';
import { MemoryCampaignGenerationRepository } from './generation-store.ts';
import { englishBellCampaign } from './generation/bell-english.ts';
import { seedWorkshopEdits, WORKSHOP_EDIT_FIXTURE_PROVIDER } from './ui-workshop-edits.ts';
import { completePreviewVisualBriefs } from './ui-workshop-images.ts';
import {
  WORKSHOP_FIXTURES,
  workshopOwnerId,
  workshopDraftId,
  type WorkshopFixture,
} from './ui-workshop-links.ts';
import { seedWorkshopAccess } from './ui-workshop-fixtures.ts';
import { MemoryWorkshopStore } from './workshop-store.ts';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function fixture(name: WorkshopFixture = 'edit-en') {
  const seed = 'unit-only-stage430-browser-fixture',
    store = new MemoryWorkshopStore();
  const revisions = new MemoryCampaignRevisionRepository(store),
    images = new MemoryDraftImageRepository(store, revisions);
  const generation = new MemoryCampaignGenerationRepository(store, revisions);
  const ownerId = workshopOwnerId(seed, name),
    draftId = workshopDraftId(seed, name),
    authSessionId = randomUUID();
  const createdAt = new Date().toISOString(),
    expiresAt = new Date(Date.now() + 86400000).toISOString(),
    tokenHash = hashToken(newToken());
  await store.issueInvitation({
    ownerId,
    invitationId: randomUUID(),
    tokenHash,
    createdAt,
    expiresAt,
    authorizationSource: 'unit:browser-fixture',
  });
  await store.redeem(
    tokenHash,
    { sessionId: authSessionId, tokenHash: hashToken(newToken()), createdAt, expiresAt },
    null,
  );
  const content = englishBellCampaign();
  completePreviewVisualBriefs(content);
  await store.createDraft(
    ownerId,
    { requestId: randomUUID(), title: content.world.name, language: 'en' },
    draftId,
    createdAt,
  );
  const saved = await revisions.append({
    ownerId,
    draftId,
    requestId: randomUUID(),
    basedOnRevision: 0,
    content,
    source: { kind: 'OWNER', actorId: ownerId },
    createdAt,
  });
  if (saved.kind !== 'saved') throw new Error('baseline absent');
  const runtime = seedWorkshopEdits(store, revisions, images, generation, seed);
  cleanup.push(runtime.stopEdits);
  const base = saved.revision,
    scope = { ownerId, draftId };
  const locks = await runtime.revisionControls.locks(scope),
    manifest = await images.manifest(scope, 1);
  if (!locks || !manifest) throw new Error('guards absent');
  const queue = async (target: string, instruction: string) => {
    const plan = buildCampaignEditPlan(base, locks, manifest, instruction, [target]);
    if (!plan.spec) throw new Error('plan absent');
    const queued = await runtime.edits.repository.enqueueEdit({
      ...scope,
      authSessionId,
      requestId: randomUUID(),
      basedOnRevision: 1,
      seed: base.content,
      lockVersion: locks.version,
      editSpec: plan.spec,
    });
    if (queued.kind !== 'saved') throw new Error('edit absent');
    const jobScope = { ...scope, jobId: queued.job.jobId };
    await new CampaignEditWorker({ ...runtime.edits, packages: revisions }).run(jobScope);
    return {
      scope: jobScope,
      spec: plan.spec,
      candidate: await runtime.edits.repository.candidate(jobScope),
    };
  };
  return {
    ...runtime,
    ...scope,
    store,
    revisions,
    images,
    generation,
    base,
    locks,
    manifest,
    authSessionId,
    queue,
  };
}
describe('Stage430 browser edit fixture composition', () => {
  it('runs a real candidate-only worker against the frozen baseline and public target catalog', async () => {
    const f = await fixture();
    const target = campaignEditTargets(f.base).find(
      (item) => item.section === 'entities' && item.key === 'arden',
    );
    if (!target) throw new Error('Arden absent');
    const instruction =
      'Give Arden a clearer reason to protect river travelers; keep the prepared setting intact.';
    const result = await f.queue(target.targetId, instruction);
    expect(result.candidate?.source).toMatchObject({
      kind: 'AI',
      provider: WORKSHOP_EDIT_FIXTURE_PROVIDER,
    });
    expect(
      result.candidate?.content.entities.find((item) => item.key === 'arden')?.description,
    ).toContain('his family once depended on a ferryman');
    expect(result.candidate?.content.entities.filter((item) => item.key !== 'arden')).toEqual(
      f.base.content.entities.filter((item) => item.key !== 'arden'),
    );
    expect(result.candidate?.content.world).toEqual(f.base.content.world);
    expect((await f.revisions.latest(f.ownerId, f.draftId))?.digest).toBe(f.base.digest);
    expect(await f.edits.repository.progress(result.scope)).toMatchObject({
      edit: { instruction, requestedTargets: [target.targetId] },
      job: { status: 'SUCCEEDED', attachedRevision: null },
    });
    expect(
      Object.keys((await f.edits.repository.progress(result.scope))?.edit ?? {}).sort(),
    ).toEqual(['instruction', 'requestedTargets']);
    expect(
      await f.generation.requestById(
        f,
        (await f.edits.repository.get(result.scope))?.requestId ?? '',
      ),
    ).toBeNull();
  });
  it('changes a selected visual brief using the same real scope validator', async () => {
    const f = await fixture('edit-images');
    const target = campaignEditTargets(f.base).find(
      (item) => item.section === 'visuals' && item.key === 'arden:image',
    );
    if (!target) throw new Error('visual absent');
    const result = await f.queue(target.targetId, 'Add a red cloak to the portrait.');
    expect(
      result.candidate?.content.visuals.find(
        (item) => item.entity === 'arden' && item.purpose === 'image',
      )?.description,
    ).toContain('red cloak');
    expect(result.candidate?.content.entities).toEqual(f.base.content.entities);
  });
  it('exposes controls for older owners but keeps unsupported edit generation honestly unavailable', async () => {
    const f = await fixture('scenario-en');
    expect(await f.revisionControls.locks(f)).not.toBeNull();
    expect(await f.edits.preparation.availability(f.ownerId)).toEqual({
      available: false,
      reason: 'NO_ROUTE',
      providers: [],
    });
    const unsupported = await fixture('edit-unavailable');
    expect(await unsupported.edits.preparation.availability(unsupported.ownerId)).toMatchObject({
      available: false,
      reason: 'NO_ROUTE',
    });
    const result = await unsupported.queue('section:world', 'Make the opening urgent.');
    expect(result.candidate).toBeNull();
    expect((await unsupported.edits.repository.get(result.scope))?.failureCode).toBe(
      'PREPARATION_UNAVAILABLE',
    );
  });
  it('provides baseline revisions and revision controls in the actual browser server fixture for every edit owner', async () => {
    const seed = 'unit-stage430-whole-browser-composition';
    const prepared = await seedWorkshopAccess(
      new InMemoryCredentialStore(),
      new WorldEngine({
        store: new InMemoryEventStore(),
        ids: new SequentialIds(),
        clock: new SteppingClock(),
        combat: createCombatEngine(),
      }),
      seed,
    );
    cleanup.push(prepared.stopGeneration);
    const { workshop } = prepared;
    for (const name of WORKSHOP_FIXTURES.filter((value) => value.startsWith('edit-'))) {
      const ownerId = workshopOwnerId(seed, name),
        draftId = workshopDraftId(seed, name);
      const revision = await workshop.packages?.latest(ownerId, draftId);
      expect(revision).toMatchObject({
        revision: 1,
        content: { world: { language: name === 'edit-ru' ? 'ru' : 'en' } },
      });
      expect(revision?.content.visuals.some((item) => item.purpose === 'figure')).toBe(true);
      expect(await workshop.revisionControls?.locks({ ownerId, draftId })).not.toBeNull();
      expect((await workshop.edits?.preparation.availability(ownerId))?.available).toBe(
        name !== 'edit-unavailable',
      );
      expect((await workshop.images?.runtime.availability(ownerId))?.available).toBe(
        name !== 'edit-unavailable',
      );
    }
    expect(
      await workshop.revisionControls?.locks({
        ownerId: workshopOwnerId(seed, 'scenario-en'),
        draftId: workshopDraftId(seed, 'scenario-en'),
      }),
    ).not.toBeNull();
    expect(workshop.cancelEdit).toBeTypeOf('function');
  });
});
