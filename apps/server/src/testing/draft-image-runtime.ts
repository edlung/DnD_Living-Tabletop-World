import type { CampaignRevision } from '@ltw/contracts';

import { draftImageInputSchema, resolveDraftImageVisual } from '../images/draft-input.ts';
import type {
  DraftImageRuntime,
  DraftImageRunResult,
  PreparedDraftImage,
} from '../images/draft-runtime-types.ts';
import { draftImageSourceSignature, imageDigest } from '../workshop/images/manifest.ts';
import type {
  DraftImageJobScope,
  DraftImageLease,
  DraftImageRepository,
} from '../workshop/images/store.ts';
import { MemoryDraftImageRepository } from './draft-image-store.ts';
import { generationFixture, T0 } from './generation/fixture.ts';
import { picture } from './image-provider.ts';

export const SCRIPTED_IMAGE_PROVIDER = 'test-image-provider';
export const SCRIPTED_IMAGE_MODEL = 'scripted-image-1';
type RunInput = Parameters<PreparedDraftImage['run']>[0];

/** Test-only explicit script. It is never a production provider or an AI fallback. */
export class ScriptedDraftImageRuntime implements DraftImageRuntime {
  available = true;
  skipGate = false;
  provider = SCRIPTED_IMAGE_PROVIDER;
  model = SCRIPTED_IMAGE_MODEL;
  beforeGate: ((lease: DraftImageLease, call: RunInput) => Promise<void>) | null = null;
  afterGate: ((lease: DraftImageLease, call: RunInput) => Promise<void>) | null = null;
  readonly calls: string[] = [];
  readonly #repository: DraftImageRepository;
  readonly #bytes: Uint8Array;
  constructor(repository: DraftImageRepository, bytes: Uint8Array) {
    this.#repository = repository;
    this.#bytes = bytes;
  }
  availability(ownerId: string) {
    const available = this.available && ownerId !== '';
    return Promise.resolve({
      available,
      provider: available ? this.provider : null,
      model: available ? this.model : null,
      reason: available ? ('READY' as const) : ('NO_ROUTE' as const),
    });
  }
  prepare(source: Parameters<DraftImageRuntime['prepare']>[0]) {
    const entity = source.revision.content.entities.find(
      (item) => source.revision.identities.entities[item.key] === source.entityId,
    );
    const visual =
      entity && resolveDraftImageVisual(source.revision.content, entity.key, source.purpose);
    if (!this.available || !entity || !visual)
      return Promise.resolve({ status: 'UNAVAILABLE' as const, reason: 'TEST_UNAVAILABLE' });
    const parsed = draftImageInputSchema.safeParse({
      schemaVersion: 1,
      subject: { entityId: source.entityId, localKey: entity.key, kind: entity.kind },
      appearance: visual.description,
      style: visual.style,
      note: source.note ?? null,
      purpose: source.purpose,
      variant: source.purpose === 'image' ? 'reference' : 'derived',
      label: source.purpose === 'image' ? null : source.purpose,
      reference: source.reference
        ? {
            candidateId: source.reference.candidateId,
            contentHash: source.reference.contentHash,
            mediaType: source.reference.mediaType,
          }
        : null,
      stylePolicy: { version: 1, referenceHashes: [] },
    });
    return Promise.resolve(
      parsed.success
        ? {
            status: 'PREPARED' as const,
            input: parsed.data,
            provider: this.provider,
            model: this.model,
            requestDigest: imageDigest(parsed.data),
          }
        : { status: 'UNAVAILABLE' as const, reason: 'TEST_INPUT_INVALID' },
    );
  }
  forJob(lease: DraftImageLease): Promise<PreparedDraftImage | null> {
    if (!this.available) return Promise.resolve(null);
    return Promise.resolve({
      provider: this.provider,
      model: this.model,
      run: async (call) => {
        const job = await this.#repository.get(lease);
        if (!job) throw new Error('TEST_JOB_MISSING');
        await this.beforeGate?.(lease, call);
        const allowed =
          this.skipGate ||
          (await call.beforeDispatch({
            chargeId: call.chargeId,
            requestDigest: job.requestDigest,
          }));
        if (!allowed)
          return {
            status: 'UNAVAILABLE',
            bytes: null,
            mediaType: null,
            provider: this.provider,
            model: this.model,
            failure: 'UNAVAILABLE',
            execution: {
              chargeId: call.chargeId,
              outcome: 'not_dispatched',
              returnedModel: null,
              providerRequestId: null,
            },
          };
        this.calls.push(lease.jobId);
        await this.afterGate?.(lease, call);
        return {
          status: 'GENERATED',
          bytes: this.#bytes.slice(),
          mediaType: 'image/png',
          provider: this.provider,
          model: this.model,
          failure: null,
          execution: {
            chargeId: call.chargeId,
            outcome: 'generated',
            returnedModel: this.model,
            providerRequestId: 'test-script',
          },
        } satisfies DraftImageRunResult;
      },
    });
  }
}

export async function draftImageFixture() {
  const base = await generationFixture();
  let now = T0;
  const repository = new MemoryDraftImageRepository(base.workshop, base.revisions, () => now);
  const runtime = new ScriptedDraftImageRuntime(repository, await picture(8, 8));
  const appended = await base.revisions.append({
    ownerId: base.ownerId,
    draftId: base.draftId,
    requestId: crypto.randomUUID(),
    basedOnRevision: 0,
    content: base.content,
    source: { kind: 'OWNER', actorId: base.ownerId },
    createdAt: new Date(now).toISOString(),
  });
  if (appended.kind !== 'saved') throw new Error('TEST_REVISION_MISSING');
  const revision: CampaignRevision = appended.revision;
  const visual = revision.content.visuals.find((item) => item.purpose === 'image');
  const entityId = visual ? revision.identities.entities[visual.entity] : null;
  if (!entityId) throw new Error('TEST_IMAGE_SUBJECT_MISSING');
  const enqueue = async (): Promise<DraftImageJobScope> => {
    const prepared = await runtime.prepare({
      revision,
      entityId,
      purpose: 'image',
      reference: null,
    });
    if (prepared.status !== 'PREPARED') throw new Error('TEST_IMAGE_PREPARATION_FAILED');
    const sourceSignature = draftImageSourceSignature(
      revision,
      { entityId, purpose: 'image', variant: 'reference', label: null },
      null,
    );
    if (!sourceSignature) throw new Error('TEST_IMAGE_SIGNATURE_MISSING');
    const queued = await repository.request({
      ownerId: base.ownerId,
      draftId: base.draftId,
      authSessionId: base.sessionId,
      requestId: crypto.randomUUID(),
      revision: 1,
      packageDigest: revision.digest,
      expectedManifestVersion: 0,
      input: prepared.input,
      provider: prepared.provider,
      model: prepared.model,
      requestDigest: prepared.requestDigest,
      sourceSignature,
    });
    if (queued.kind !== 'saved') throw new Error('TEST_IMAGE_JOB_MISSING');
    return { ownerId: base.ownerId, draftId: base.draftId, jobId: queued.job.jobId };
  };
  return {
    repository,
    runtime,
    revision,
    enqueue,
    workshop: base.workshop,
    ownerId: base.ownerId,
    draftId: base.draftId,
    sessionId: base.sessionId,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

export function deferredImage() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
