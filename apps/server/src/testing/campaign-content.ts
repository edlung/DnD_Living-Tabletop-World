import type { CampaignPublication } from '../campaigns/publication.ts';
import type { CampaignInitialContent, CampaignInitialContentStore } from '../campaigns/content.ts';
import { activationInitialContent } from '../workshop/activation/content.ts';
import { imageDigest } from '../workshop/images/manifest.ts';
import type {
  StoredCampaignActivation,
  CampaignActivationRepository,
} from '../workshop/activation/store.ts';
import type { MemoryCampaignActivationRepository } from './activation-store.ts';

export class MemoryCampaignInitialContentStore implements CampaignInitialContentStore {
  readonly #repository: Pick<CampaignActivationRepository, 'get'>;
  readonly #rows = new Map<string, CampaignInitialContent>();
  constructor(repository: Pick<CampaignActivationRepository, 'get'>) {
    this.#repository = repository;
  }
  async prepare(activation: StoredCampaignActivation) {
    const actual = await this.#repository.get(activation);
    if (
      !actual ||
      actual.activationId !== activation.activationId ||
      actual.campaignId !== activation.campaignId ||
      imageDigest(actual.frozen) !== imageDigest(activation.frozen)
    )
      throw new Error('ACTIVATION_CONTENT_MISMATCH');
    const content = activationInitialContent(actual),
      old = this.#rows.get(actual.campaignId);
    if (old && imageDigest(old) !== imageDigest(content))
      throw new Error('INITIAL_CONTENT_CONFLICT');
    if (!old) this.#rows.set(actual.campaignId, structuredClone(content));
  }
  get(campaignId: string) {
    return Promise.resolve(structuredClone(this.#rows.get(campaignId) ?? null));
  }
}
export class MemoryCampaignPublication implements CampaignPublication {
  readonly #repository: MemoryCampaignActivationRepository;
  constructor(repository: MemoryCampaignActivationRepository) {
    this.#repository = repository;
  }
  state(campaignId: string) {
    return Promise.resolve(this.#repository.publicationState(campaignId));
  }
}
