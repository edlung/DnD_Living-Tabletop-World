import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import manifest from '../../campaigns/lighthouse/assets/player-book/manifest.json' with { type: 'json' };
import type { LibraryPicture } from '../campaign-library/catalog.ts';

/** Keep the approved subject, variants, reveal timing and portrait/figure lineage of each plate. */
export async function lighthousePlayerPictures(
  pictures: readonly LibraryPicture[],
): Promise<LibraryPicture[]> {
  const plates = new Map(
    manifest.flatMap(({ originalSha256, generated, prompt, files }) =>
      Object.entries(files).map(
        ([id, plate]) => [id, { ...plate, originalSha256, generated, prompt }] as const,
      ),
    ),
  );
  return Promise.all(
    pictures.map(async (picture) => {
      const plate = plates.get(picture.file);
      if (!plate) return picture;
      const source = 'campaigns/lighthouse/assets/player-book/' + plate.file;
      const bytes = await readFile(new URL('../../' + source, import.meta.url));
      if (createHash('sha256').update(bytes).digest('hex') !== plate.sha256)
        throw new Error('Changed player artwork: ' + plate.file);
      return {
        ...picture,
        source,
        bytes,
        originalSha256: plate.originalSha256,
        sha256: plate.sha256,
        generated: plate.generated,
        prompt: plate.prompt,
      };
    }),
  );
}
