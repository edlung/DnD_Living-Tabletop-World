import type { CampaignRevision } from '@ltw/contracts';

import {
  materializeCampaign,
  materializeCampaignEncounter,
  type PreparedCampaignMaterialization,
} from '../packages/compiler.ts';

/** Bounded immutable-world cache. Authorization is always performed by HTTP before using it. */
export class PreviewMaterializer {
  readonly #cache = new Map<string, Promise<PreparedCampaignMaterialization>>();
  readonly #limit: number;

  constructor(limit = 16) {
    this.#limit = limit;
  }

  load(
    revision: CampaignRevision,
    ownerId: string,
    encounterId: string | null = null,
  ): Promise<PreparedCampaignMaterialization> {
    const key = `${ownerId}/${revision.draftId}/${String(revision.revision)}/${revision.digest}/${encounterId ?? ''}`;
    const previous = this.#cache.get(key);
    if (previous) {
      this.#cache.delete(key);
      this.#cache.set(key, previous);
      return previous;
    }
    const pending =
      encounterId === null
        ? materializeCampaign(revision, ownerId).then((value) => ({
            ...value,
            preparedSnapshot: null,
          }))
        : materializeCampaignEncounter(revision, ownerId, encounterId);
    this.#cache.set(key, pending);
    while (this.#cache.size > this.#limit) {
      const oldest = this.#cache.keys().next().value;
      if (oldest === undefined) break;
      this.#cache.delete(oldest);
    }
    void pending.catch(() => {
      if (this.#cache.get(key) === pending) this.#cache.delete(key);
    });
    return pending;
  }
}
