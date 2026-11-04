import type { AssetLineageResponse, EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import { Glyph } from '../visual/glyph.tsx';
import type { DmImages } from './dm-images.ts';
import { requestCommand } from './lineage.ts';

/**
 * The portraits players asked for (docs/adr/0056-characters-from-the-srd.md §5), on the DM's
 * Images sheet: each character's look in its player's words, and the DM's request for its portrait
 * with those words as the note — the image model is asked only then. The request answers the wish.
 */
export function PortraitWishes({
  images,
  lineage,
  directory,
}: {
  readonly images: DmImages;
  readonly lineage: AssetLineageResponse;
  readonly directory: readonly EntityRef[];
}) {
  const t = useT();
  if (lineage.wishes.length === 0) return null;
  return (
    <section className="portrait-wishes" aria-labelledby="portrait-wishes-title">
      <h3 id="portrait-wishes-title">
        <Glyph name="picture" />
        {t('Portraits players asked for')}
      </h3>
      <ul>
        {lineage.wishes.map((wish) => {
          const name =
            directory.find((one) => one.entityId === wish.characterId)?.name ??
            t('Unidentified subject');
          return (
            <li key={wish.characterId}>
              <p>
                <strong>{name}</strong>
                <span>{`«${wish.look}»`}</span>
              </p>
              <button
                type="button"
                disabled={images.busy}
                onClick={() => {
                  images.run({
                    place: 'sheet',
                    command: requestCommand(
                      wish.characterId,
                      { variant: 'reference', purpose: 'image', label: null },
                      'players',
                      wish.look,
                    ),
                    subject: t('Make the portrait of {name}', { name }),
                    target: 'form',
                    success: () =>
                      t(
                        'Requested: the portrait of {name}. The candidate will appear for your approval.',
                        {
                          name,
                        },
                      ),
                  });
                }}
              >
                {t('Make the portrait of {name}', { name })}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
