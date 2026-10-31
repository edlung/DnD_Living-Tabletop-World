import {
  campaignPackageSchema,
  type CampaignPackage,
  type CampaignRevision,
  type CampaignRevisionSummary,
} from '@ltw/contracts';

import {
  allocateCampaignIdentities,
  questStageKey,
  type CampaignIdentityNamespace,
  type CampaignIdentityRecord,
} from '../workshop/packages/identities.ts';
import {
  campaignContentDigest,
  campaignRequestFingerprint,
  normalizeCampaignAppend,
  campaignRevisionSummary,
} from '../workshop/packages/content.ts';
import type {
  AppendCampaignRevision,
  AppendCampaignRevisionResult,
  CampaignRevisionRepository,
} from '../workshop/packages/store.ts';
import type { WorkshopStore } from '../workshop/store.ts';
import { imageDigest } from '../workshop/images/manifest.ts';
import { revisionWriteIntent } from '../workshop/revisions/policy.ts';

export function emptyCampaignPackage(): CampaignPackage {
  return campaignPackageSchema.parse({
    schemaVersion: 1,
    brief: {
      intent: 'Колокол подо льдом',
      setting: '',
      tone: '',
      duration: '',
      partySize: 3,
      partyLevel: 3,
      include: [],
      exclude: [],
    },
    world: {
      name: 'Колокол',
      worldName: 'Белая Пристань',
      language: 'ru',
      startsAt: 0,
      startLocation: null,
      weather: 'snow',
      opening: '',
    },
    entities: [],
    party: [],
    knowledge: [],
    relationships: [],
    clues: [],
    conflicts: [],
    situations: [],
    encounters: [],
    quests: [],
    visuals: [],
    firstSession: [],
    laterOutline: [],
  });
}

/** Reference semantics only; no production module may import this in-memory repository. */
export class MemoryCampaignRevisionRepository implements CampaignRevisionRepository {
  readonly #workshop: WorkshopStore;
  readonly #revisions = new Map<string, CampaignRevision[]>();
  readonly #requests = new Map<
    string,
    { fingerprint: string; policy: string; revision: CampaignRevision }
  >();
  readonly #identities = new Map<string, readonly CampaignIdentityRecord[]>();
  readonly #appendHooks = new Set<(ownerId: string, revision: CampaignRevision) => () => void>();
  readonly #appendGuards = new Set<
    (
      input: AppendCampaignRevision,
      revision: CampaignRevision,
    ) => AppendCampaignRevisionResult | null
  >();
  readonly #draftTails = new Map<string, Promise<void>>();
  constructor(workshop: WorkshopStore) {
    this.#workshop = workshop;
  }
  /** Test-only atomic authoring metadata hook: prepare before mutation, then commit synchronously. */
  registerAppendHook(hook: (ownerId: string, revision: CampaignRevision) => () => void): void {
    this.#appendHooks.add(hook);
  }
  registerAppendGuard(
    guard: (
      input: AppendCampaignRevision,
      revision: CampaignRevision,
    ) => AppendCampaignRevisionResult | null,
  ) {
    this.#appendGuards.add(guard);
  }
  async withDraftLock<T>(
    scope: { ownerId: string; draftId: string },
    work: () => Promise<T> | T,
  ): Promise<T> {
    const key = `${scope.ownerId}/${scope.draftId}`,
      old = this.#draftTails.get(key) ?? Promise.resolve();
    let release = () => {};
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#draftTails.set(key, tail);
    await old;
    try {
      return await work();
    } finally {
      release();
      if (this.#draftTails.get(key) === tail) this.#draftTails.delete(key);
    }
  }

  async append(raw: AppendCampaignRevision): Promise<AppendCampaignRevisionResult> {
    const input = normalizeCampaignAppend(raw);
    if (!(await this.#workshop.draft(input.ownerId, input.draftId))) return { kind: 'not-found' };
    return this.withDraftLock(input, () => this.appendWithinDraftLock(input));
  }
  /** Caller must hold withDraftLock after owner authorization. No await before mutation completes. */
  appendWithinDraftLock(input: AppendCampaignRevision): AppendCampaignRevisionResult {
    const prepared = this.prepareAppendWithinDraftLock(input);
    prepared.commit();
    return prepared.result;
  }
  prepareAppendWithinDraftLock(raw: AppendCampaignRevision): {
    result: AppendCampaignRevisionResult;
    commit: () => void;
  } {
    const input = normalizeCampaignAppend(raw);
    const reject = (result: AppendCampaignRevisionResult) => ({ result, commit: () => {} });
    // No await from reading the current version until the whole mutation is stored.
    const key = `${input.ownerId}/${input.draftId}`;
    const requestKey = `${key}/${input.requestId}`;
    const fingerprint = campaignRequestFingerprint(input);
    const policy = imageDigest(revisionWriteIntent(input));
    const previous = this.#requests.get(requestKey);
    if (previous)
      return reject(
        previous.fingerprint === fingerprint && previous.policy === policy
          ? { kind: 'saved', revision: structuredClone(previous.revision) }
          : { kind: 'conflict', reason: 'REQUEST_REUSED' },
      );
    const revisions = this.#revisions.get(key) ?? [];
    if ((revisions.at(-1)?.revision ?? 0) !== input.basedOnRevision)
      return reject({ kind: 'conflict', reason: 'STALE_REVISION' });
    const registry = this.#identities.get(key) ?? [];
    const allocation = allocateCampaignIdentities(input.content, registry);
    if (allocation.kind === 'conflict')
      return reject({ kind: 'conflict', reason: 'IDENTITY_KIND_CHANGED' });
    const revision: CampaignRevision = {
      draftId: input.draftId,
      revision: input.basedOnRevision + 1,
      basedOnRevision: input.basedOnRevision,
      content: input.content,
      identities: allocation.identities,
      digest: campaignContentDigest(input.content, allocation.identities),
      source: input.source,
      createdAt: input.createdAt,
    };
    const stored = structuredClone(revision);
    if (this.#appendGuards.size === 0 && (input.expectedLockVersion ?? 0) !== 0)
      return reject({ kind: 'conflict', reason: 'STALE_LOCKS' });
    if (this.#appendGuards.size === 0 && input.expectedManifestVersion !== undefined)
      return reject({ kind: 'conflict', reason: 'STALE_MANIFEST' });
    for (const guard of this.#appendGuards) {
      const rejected = guard(input, stored);
      if (rejected) return reject(rejected);
    }
    const commits = [...this.#appendHooks].map((hook) =>
      hook(input.ownerId, structuredClone(stored)),
    );
    return {
      result: { kind: 'saved', revision: structuredClone(stored) },
      commit: () => {
        this.#revisions.set(key, [...revisions, stored]);
        this.#identities.set(key, [...registry, ...allocation.added]);
        this.#requests.set(requestKey, { fingerprint, policy, revision: stored });
        for (const commit of commits) commit();
      },
    };
  }
  async latest(ownerId: string, draftId: string): Promise<CampaignRevision | null> {
    if (!(await this.#workshop.draft(ownerId, draftId))) return null;
    return structuredClone(this.#revisions.get(`${ownerId}/${draftId}`)?.at(-1) ?? null);
  }
  async identityRecords(
    ownerId: string,
    draftId: string,
    content: CampaignPackage,
  ): Promise<readonly CampaignIdentityRecord[]> {
    if (!(await this.#workshop.draft(ownerId, draftId))) return [];
    const keys: Record<CampaignIdentityNamespace, Set<string>> = {
      entities: new Set(content.entities.map((e) => e.key)),
      knowledge: new Set(content.knowledge.map((e) => e.key)),
      clues: new Set(content.clues.map((e) => e.key)),
      encounters: new Set(content.encounters.map((e) => e.key)),
      scene: new Set(['initial']),
      quests: new Set(content.quests.map((quest) => quest.questId)),
      'quest-stages': new Set(
        content.quests.flatMap((quest) =>
          quest.milestones.map((milestone) => questStageKey(quest.questId, milestone.stage)),
        ),
      ),
    };
    return structuredClone(
      (this.#identities.get(`${ownerId}/${draftId}`) ?? [])
        .filter((record) => keys[record.namespace].has(record.key))
        .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.key.localeCompare(b.key)),
    );
  }
  async get(ownerId: string, draftId: string, revision: number): Promise<CampaignRevision | null> {
    if (!(await this.#workshop.draft(ownerId, draftId))) return null;
    return structuredClone(
      this.#revisions.get(`${ownerId}/${draftId}`)?.find((value) => value.revision === revision) ??
        null,
    );
  }
  async list(
    ownerId: string,
    draftId: string,
    before: number | null,
    limit: number,
  ): Promise<readonly CampaignRevisionSummary[]> {
    if (!(await this.#workshop.draft(ownerId, draftId))) return [];
    return structuredClone(
      [...(this.#revisions.get(`${ownerId}/${draftId}`) ?? [])]
        .reverse()
        .filter((revision) => before === null || revision.revision < before)
        .slice(0, limit)
        .map(campaignRevisionSummary),
    );
  }
}
