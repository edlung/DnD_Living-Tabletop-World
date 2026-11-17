import { MAX_PLACE_SOUNDS, type PlaceSound } from '@ltw/contracts';

/**
 * Places' own sounds (docs/adr/0073-table-ideas.md §6; migration 0046): one a place, replaced on
 * save and removed when it brings nothing. The in-memory store is the reference semantics for the
 * PostgreSQL one.
 */
export interface PlaceSoundStore {
  /** The campaign's places that bring a sound, by place. */
  list(campaignId: string): Promise<readonly PlaceSound[]>;
  get(campaignId: string, locationId: string): Promise<PlaceSound | null>;
  /**
   * Saves the place's sound; one that brings nothing is removed. False when the campaign has as
   * many as it may and this would be one more.
   */
  put(campaignId: string, sound: PlaceSound, at: string): Promise<boolean>;
}

const brings = (sound: PlaceSound): boolean => sound.ambience !== null || sound.trackId !== null;

export class InMemoryPlaceSoundStore implements PlaceSoundStore {
  readonly #sounds = new Map<string, Map<string, PlaceSound>>();

  list(campaignId: string): Promise<readonly PlaceSound[]> {
    return Promise.resolve(
      [...(this.#sounds.get(campaignId)?.values() ?? [])]
        .map((sound) => ({ ...sound }))
        .sort((a, b) => a.locationId.localeCompare(b.locationId)),
    );
  }

  get(campaignId: string, locationId: string): Promise<PlaceSound | null> {
    const sound = this.#sounds.get(campaignId)?.get(locationId);
    return Promise.resolve(sound ? { ...sound } : null);
  }

  put(campaignId: string, sound: PlaceSound): Promise<boolean> {
    const sounds = this.#sounds.get(campaignId) ?? new Map<string, PlaceSound>();
    if (!brings(sound)) {
      sounds.delete(sound.locationId);
    } else {
      if (!sounds.has(sound.locationId) && sounds.size >= MAX_PLACE_SOUNDS) {
        return Promise.resolve(false);
      }
      sounds.set(sound.locationId, { ...sound });
    }
    this.#sounds.set(campaignId, sounds);
    return Promise.resolve(true);
  }
}
