import type { SessionResponse } from '@ltw/contracts';

import type { GameSignOutGuard } from '../api/client.ts';

/** Only the first identity actually shown by this connection may qualify its logout. */
export class MountedGameIdentity {
  readonly #campaignId: string;
  #actorId: string | null = null;

  constructor(campaignId: string) {
    this.#campaignId = campaignId;
  }

  observe(identity: SessionResponse): void {
    if (
      this.#actorId === null &&
      identity.campaign.campaignId === this.#campaignId &&
      typeof identity.actorId === 'string' &&
      identity.actorId.length > 0
    )
      this.#actorId = identity.actorId;
  }

  read(): GameSignOutGuard {
    return {
      campaignId: this.#campaignId,
      ...(this.#actorId === null ? {} : { actorId: this.#actorId }),
    };
  }
}
