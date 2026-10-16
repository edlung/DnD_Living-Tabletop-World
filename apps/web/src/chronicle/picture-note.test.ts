import type { EntityPresentation, FlashbackResponse, PlayerAssetView } from '@ltw/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { WorldApi } from '../api/client.ts';
import { ApprovedImages, ApprovedImagesContext } from '../visual/approved-images.ts';
import { Vignette } from './flashback-scene.tsx';
import { pictureNote } from './picture-note.ts';

/*
 * A place's picture slot says "no approved picture" only when the presentation says so (ADR
 * 0034; review of Stage 320 part C): while an approved picture loads, or after its fetch
 * failed, the neutral mist shows and claims nothing.
 */
const APPROVED: PlayerAssetView = {
  variant: 'reference',
  version: 1,
  contentHash: 'a'.repeat(64),
  mediaType: 'image/png',
};
const NONE = 'No approved picture of this place yet';

describe('the note under a place’s picture', () => {
  it('says none is approved only when the presentation has no image', () => {
    expect(pictureNote(true, { image: null })).toBe(NONE);
    expect(pictureNote(true, { image: APPROVED })).toBeNull();
  });

  it('claims nothing while the presentation is read', () => {
    expect(pictureNote(true, 'loading')).toBeNull();
  });

  it('says only that there is nothing to show when the view may not see the place', () => {
    expect(pictureNote(true, 'withheld')).toBe('No picture of this place to show');
  });

  it('says when a chapter names no place', () => {
    expect(pictureNote(false, 'loading')).toBe('This chapter names no place');
  });
});

/** A flashback's vignette with its approved image not fetched yet (or its fetch failed). */
function vignette(scene: EntityPresentation | null): string {
  const flashback = {
    perspective: 'CHARACTER:elowen-starwhisper',
    memoryId: 'memory-1',
    worldTime: 0,
    phase: 'day',
    scene,
    participants: [],
    dialogue: { text: 'The caravan left before dawn.', knowledgeType: null, speaker: null },
    sources: [],
  } as unknown as FlashbackResponse;
  // Nothing is fetched while rendering to markup: the image is still on its way.
  const images = new ApprovedImages({} as WorldApi);
  return renderToStaticMarkup(
    createElement(
      ApprovedImagesContext.Provider,
      { value: images },
      createElement(Vignette, { flashback, placeName: 'Market Square' }),
    ),
  );
}

const place = (image: PlayerAssetView | null) =>
  ({ entityId: 'market-square', kind: 'location', observed: true, image }) as EntityPresentation;

describe('a flashback’s vignette', () => {
  it('shows the mist without a claim while its approved picture is on its way', () => {
    const markup = vignette(place(APPROVED));
    expect(markup).toContain('flashback-vignette--mist');
    expect(markup).not.toContain(NONE);
    expect(markup).not.toContain('flashback-note');
  });

  it('says none is approved when the place has no approved picture', () => {
    expect(vignette(place(null))).toContain(NONE);
  });

  it('makes no claim about approval when the view may not see the place as it was', () => {
    const markup = vignette(null);
    expect(markup).not.toContain(NONE);
    expect(markup).toContain('No picture of this place to show');
  });
});
