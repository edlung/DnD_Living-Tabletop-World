import { useT } from '@ltw/ui';

import type { WorldApi } from '../api/client.ts';
import { starsOf, useReflections } from './reflections.ts';
import { WordsList } from './stars-list.tsx';

/**
 * The evening's stars on the table's screen (docs/adr/0071-memory-and-ritual.md §2), read in the
 * party's view: the prompt while none is written, then each star as it comes. Never a wish — the
 * server sends this view none.
 */
export function StarsCast({
  api,
  refresh,
}: {
  readonly api: WorldApi;
  /** The screen's live signal. */
  readonly refresh: number;
}) {
  const t = useT();
  const { sessions } = useReflections(api, refresh);
  const latest = sessions?.[0] ?? null;
  const stars = latest ? starsOf(latest) : [];
  return (
    <section className="display-stars" aria-label={t('Stars of the evening')}>
      <div className="display-stars-page">
        <p className="previously-eyebrow">{t('Stars of the evening')}</p>
        {latest && <h1>{latest.title}</h1>}
        {stars.length === 0 ? (
          <p className="display-stars-prompt">
            {t('A star for tonight: what did you like? A wish for next time: what do you want?')}
          </p>
        ) : (
          <WordsList
            entries={stars}
            words="star"
            className={stars.length > 4 ? 'evening-words--columns' : ''}
          />
        )}
        {/* Kept under the stars too: whoever writes later still reads how, and who reads what. */}
        <p className="display-stars-how">
          {t(
            'Write on your own screen, or tell the DM. Stars appear here; wishes go only to the DM.',
          )}
        </p>
      </div>
    </section>
  );
}
