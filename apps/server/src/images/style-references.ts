import sharp from 'sharp';

import type { CuratedSet } from './curated-set.ts';
import type { subjectGroup } from './style.ts';

/**
 * Style references of in-play images (docs/STAGE_330_DESIGN.md, "Art direction"): two canonical
 * pictures of the curated set per kind of subject, sent with a new reference so that it is
 * painted like the set. Only their style is asked for (`style.ts`). Downscaled once at startup:
 * style needs no full resolution, and smaller inputs cost less.
 */
export type StyleReferences = Readonly<
  Record<ReturnType<typeof subjectGroup>, readonly Uint8Array[]>
>;

export const STYLE_REFERENCE_FILES: Readonly<Record<keyof StyleReferences, readonly string[]>> = {
  person: ['mira-vale.webp', 'orin-stonebeard.webp'],
  place: ['market-square.webp', 'golden-stag-inn.webp'],
  object: ['broken-wagon-wheel.webp', 'goblin-weapon.webp'],
};

const STYLE_EDGE_PX = 768;

export const NO_STYLE_REFERENCES: StyleReferences = { person: [], place: [], object: [] };

export async function loadStyleReferences(set: CuratedSet): Promise<StyleReferences> {
  const scaled = async (file: string) =>
    new Uint8Array(
      await sharp(set.bytesOf(file))
        .resize({ width: STYLE_EDGE_PX, height: STYLE_EDGE_PX, fit: 'inside' })
        .webp({ quality: 80 })
        .toBuffer(),
    );
  const group = async (files: readonly string[]) => Promise.all(files.map(scaled));
  return {
    person: await group(STYLE_REFERENCE_FILES.person),
    place: await group(STYLE_REFERENCE_FILES.place),
    object: await group(STYLE_REFERENCE_FILES.object),
  };
}
