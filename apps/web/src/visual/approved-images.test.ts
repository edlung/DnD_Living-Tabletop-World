import type { PlayerAssetView, ScenePresentationResponse } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import type { WorldApi } from '../api/client.ts';
import { ApprovedImages, pictureTime, withPictureTimes } from './approved-images.ts';

/**
 * Pictures fetched for the time their presentation chose them for (Gate 06 review): the server
 * serves only what presentation could choose then, so a live picture asked for "now" after the
 * world moved on would 404 and leave the fallback. That the live screens' hooks ask with it is
 * checked in the browser (`tests/e2e/images-dm.spec.ts`).
 */
const picture = (hash: string): PlayerAssetView => ({
  variant: 'derived',
  purpose: 'image',
  contentHash: hash,
  mediaType: 'image/svg+xml',
});

/** A fake API recording each fetch; `fail` lists the times that answer 404. */
function api(fail: readonly (number | null)[] = []) {
  const calls: { hash: string; at: number | null }[] = [];
  const fake = {
    image: (hash: string, _signal: AbortSignal, at: number | null = null) => {
      calls.push({ hash, at });
      return fail.includes(at)
        ? Promise.reject(new Error('404'))
        : Promise.resolve(new Blob(['<svg/>'], { type: 'image/svg+xml' }));
    },
  };
  return { api: fake as unknown as WorldApi, calls };
}

describe('the time a picture was chosen for', () => {
  it('is recorded for every picture of a scene, a place and who is there', () => {
    const scene = withPictureTimes({
      perspective: 'PARTY',
      worldTime: 79_200,
      phase: 'night',
      location: { entityId: 'market-square', image: picture('a'), figure: null, battleMap: null },
      present: [{ entityId: 'mira-vale', image: picture('b'), figure: picture('c') }],
    } as unknown as ScenePresentationResponse);
    expect(pictureTime(scene.location.image)).toBe(79_200);
    expect(pictureTime(scene.present[0]?.image ?? null)).toBe(79_200);
    expect(pictureTime(scene.present[0]?.figure ?? null)).toBe(79_200);
    // A picture from no presentation response has none: it is fetched for now.
    expect(pictureTime(picture('a'))).toBeNull();
    expect(pictureTime(null)).toBeNull();
  });

  it('is what the cache fetches with, and the bytes once held serve any time', async () => {
    const { api: fake, calls } = api([100]);
    const images = new ApprovedImages(fake);
    // Refused for one time: another time is still asked.
    expect(await images.load('sha256:a', 100)).toBeNull();
    const url = await images.load('sha256:a', 200);
    expect(url).not.toBeNull();
    expect(await images.load('sha256:a', 300)).toBe(url);
    expect(images.peek('sha256:a')).toBe(url);
    expect(calls).toEqual([
      { hash: 'sha256:a', at: 100 },
      { hash: 'sha256:a', at: 200 },
    ]);
    images.release();
  });
});
