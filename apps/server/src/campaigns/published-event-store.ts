import type { AppendBatch, EventStore } from '@ltw/domain';
import type { CampaignPublication } from './publication.ts';

export class CampaignUnpublishedError extends Error {
  constructor() {
    super('CAMPAIGN_UNPUBLISHED');
    this.name = 'CampaignUnpublishedError';
  }
}
/** Ordinary engine view. Bootstrap/reconciler must receive the separate raw store. */
export class PublishedEventStore implements EventStore {
  readonly #inner: EventStore;
  readonly #publication: CampaignPublication;
  constructor(inner: EventStore, publication: CampaignPublication) {
    this.#inner = inner;
    this.#publication = publication;
  }
  async #visible(campaignId: string) {
    return (await this.#publication.state(campaignId)) !== 'UNPUBLISHED';
  }
  async loadStream(campaignId: string, afterSequence?: number) {
    return (await this.#visible(campaignId))
      ? this.#inner.loadStream(campaignId, afterSequence)
      : null;
  }
  async loadCommands(campaignId: string) {
    return (await this.#visible(campaignId)) ? this.#inner.loadCommands(campaignId) : [];
  }
  async findCommand(commandId: string) {
    const found = await this.#inner.findCommand(commandId);
    return found && (await this.#visible(found.campaignId)) ? found : null;
  }
  async append(batch: AppendBatch) {
    if (
      batch.command.commandType === 'BootstrapCampaign' ||
      !(await this.#visible(batch.campaignId))
    )
      throw new CampaignUnpublishedError();
    return this.#inner.append(batch);
  }
}
