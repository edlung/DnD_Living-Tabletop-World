import type { PlayerAssetView } from '@ltw/contracts';

/**
 * A place's presentation as a picture slot knows it: still being read; not this view's to show
 * (the perspective may not see the place as it was then, or the read failed); or read, with
 * its approved image or none.
 */
export type PlacePresentation = 'loading' | 'withheld' | { readonly image: PlayerAssetView | null };

/**
 * What a place's picture slot says under the neutral mist (ADR 0034: a UI-kit picture never
 * stands in for a world image, and the slot says so honestly). It claims that no picture is
 * approved only when the place's presentation says so; while an approved picture is still
 * loading, or after its fetch failed, the mist shows and makes no claim. The words are the
 * English keys of the client dictionary.
 */
export function pictureNote(named: boolean, presentation: PlacePresentation): string | null {
  if (!named) return 'This chapter names no place';
  if (presentation === 'loading') return null;
  if (presentation === 'withheld') return 'No picture of this place to show';
  return presentation.image === null ? 'No approved picture of this place yet' : null;
}
