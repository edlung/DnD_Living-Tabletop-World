import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { ambienceChoiceSchema, type AmbienceChoice } from './sound.ts';

/**
 * A place's own sound (docs/adr/0073-table-ideas.md §6): the DM's preparation — an ambience and
 * one of the DM's tracks — so that showing the place on the table's screens switches them on with
 * it. Table data beside the world, the DM's alone to set and to read; never canonical. What
 * plays is still the table's one sound state (docs/adr/0059-atmosphere.md): showing a place
 * writes it, and the DM's own controls change it afterwards as before.
 */
export interface PlaceSound {
  readonly locationId: string;
  /** The ambience the place brings; null leaves the table's ambience as it is. */
  readonly ambience: AmbienceChoice | null;
  /** The track the place brings, played from its start on repeat; null leaves the music as it is. */
  readonly trackId: string | null;
}

/** `POST …/dm/place-sounds/:locationId` (DM): the place's sound; both null takes it away. */
export const placeSoundRequestSchema = z
  .object({
    ambience: ambienceChoiceSchema.nullable(),
    trackId: z.uuid().nullable(),
  })
  .strict();
export type PlaceSoundRequest = z.infer<typeof placeSoundRequestSchema>;

export const placeSoundParamsSchema = z.object({ locationId: entityIdSchema }).strict();

/** `GET …/dm/place-sounds` (DM): every place that brings a sound. */
export interface PlaceSoundsResponse {
  readonly sounds: readonly PlaceSound[];
}

/** Places a campaign may give a sound to. */
export const MAX_PLACE_SOUNDS = 200;
