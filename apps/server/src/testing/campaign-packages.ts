import {
  campaignPackageSchema,
  type CampaignPackage,
  type CampaignRevision,
  type CampaignRevisionSummary,
} from '@ltw/contracts';

import {
  allocateCampaignIdentities,
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
  readonly #requests = new Map<string, { fingerprint: string; revision: CampaignRevision }>();
  readonly #identities = new Map<string, readonly CampaignIdentityRecord[]>();
  constructor(workshop: WorkshopStore) {
    this.#workshop = workshop;
  }

  async append(raw: AppendCampaignRevision): Promise<AppendCampaignRevisionResult> {
    const input = normalizeCampaignAppend(raw);
    if (!(await this.#workshop.draft(input.ownerId, input.draftId))) return { kind: 'not-found' };
    // No await from reading the current version until the whole mutation is stored.
    const key = `${input.ownerId}/${input.draftId}`;
    const requestKey = `${key}/${input.requestId}`;
    const fingerprint = campaignRequestFingerprint(input);
    const previous = this.#requests.get(requestKey);
    if (previous)
      return previous.fingerprint === fingerprint
        ? { kind: 'saved', revision: structuredClone(previous.revision) }
        : { kind: 'conflict', reason: 'REQUEST_REUSED' };
    const revisions = this.#revisions.get(key) ?? [];
    if ((revisions.at(-1)?.revision ?? 0) !== input.basedOnRevision)
      return { kind: 'conflict', reason: 'STALE_REVISION' };
    const registry = this.#identities.get(key) ?? [];
    const allocation = allocateCampaignIdentities(input.content, registry);
    if (allocation.kind === 'conflict')
      return { kind: 'conflict', reason: 'IDENTITY_KIND_CHANGED' };
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
    this.#revisions.set(key, [...revisions, stored]);
    this.#identities.set(key, [...registry, ...allocation.added]);
    this.#requests.set(requestKey, { fingerprint, revision: stored });
    return { kind: 'saved', revision: structuredClone(stored) };
  }
  async latest(ownerId: string, draftId: string): Promise<CampaignRevision | null> {
    if (!(await this.#workshop.draft(ownerId, draftId))) return null;
    return structuredClone(this.#revisions.get(`${ownerId}/${draftId}`)?.at(-1) ?? null);
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
