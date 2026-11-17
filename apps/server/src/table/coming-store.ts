import type { ComingAnswer } from '@ltw/contracts';

/**
 * Who comes to the next game (docs/adr/0073-table-ideas.md §10; migration 0048): one answer a
 * character, given for a date. An answer given for another instant than the one asked about is
 * not read: a changed date asks again. The in-memory store is the reference semantics for the
 * PostgreSQL one.
 */
export interface ComingStore {
  /** The answers given for this date, by character. */
  read(campaignId: string, gameAt: string): Promise<ReadonlyMap<string, ComingAnswer>>;
  /** A character's answer for this date, replacing any earlier one; null takes it back. */
  set(
    campaignId: string,
    characterId: string,
    gameAt: string,
    coming: ComingAnswer | null,
    at: string,
  ): Promise<void>;
  /** Forgets a campaign's answers: its date changed or was taken away. */
  clear(campaignId: string): Promise<void>;
}

export class InMemoryComingStore implements ComingStore {
  readonly #answers = new Map<string, Map<string, { gameAt: number; coming: ComingAnswer }>>();

  read(campaignId: string, gameAt: string): Promise<ReadonlyMap<string, ComingAnswer>> {
    const asked = Date.parse(gameAt);
    return Promise.resolve(
      new Map(
        [...(this.#answers.get(campaignId) ?? [])]
          .filter(([, answer]) => answer.gameAt === asked)
          .map(([characterId, answer]) => [characterId, answer.coming]),
      ),
    );
  }

  set(
    campaignId: string,
    characterId: string,
    gameAt: string,
    coming: ComingAnswer | null,
  ): Promise<void> {
    const campaign =
      this.#answers.get(campaignId) ?? new Map<string, { gameAt: number; coming: ComingAnswer }>();
    if (coming === null) campaign.delete(characterId);
    else campaign.set(characterId, { gameAt: Date.parse(gameAt), coming });
    this.#answers.set(campaignId, campaign);
    return Promise.resolve();
  }

  clear(campaignId: string): Promise<void> {
    this.#answers.delete(campaignId);
    return Promise.resolve();
  }
}
