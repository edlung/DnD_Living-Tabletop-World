import type { CampaignEnding, EndingResponse, KeepsakeView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useId, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { Glyph } from '../visual/glyph.tsx';
import { keptWords } from './ending.ts';
import { KeepsakeForm } from './keepsake-form.tsx';

/** What the heroes keep, as a list: whose and what, then the words about it. */
export function KeepsakeList({
  keepsakes,
  className = '',
}: {
  readonly keepsakes: readonly KeepsakeView[];
  readonly className?: string;
}) {
  const t = useT();
  return (
    <ul className={`evening-words keepsake-list ${className}`.trimEnd()}>
      {keepsakes.map((kept) => (
        <li key={kept.hero.entityId}>
          <strong>
            {keptWords(t, kept.hero.name ?? t('Someone at the table'), kept.kind, kept.label)}
          </strong>
          {kept.line !== '' && <span>{kept.line}</span>}
        </li>
      ))}
    </ul>
  );
}

/** The DM's closing words to the table, said to be the DM's. */
export function ClosingWords({ ending }: { readonly ending: CampaignEnding | null }) {
  const t = useT();
  if (ending === null || ending.line === '') return null;
  return (
    <figure className="finished-words">
      <figcaption>{t('The DM’s closing words')}</figcaption>
      <blockquote className="finished-line">{ending.line}</blockquote>
    </figure>
  );
}

/**
 * A finished adventure in the lobby (docs/adr/0072-keepsakes.md §2): that the game is over and
 * the story is in the book, the DM's closing words, the way into the book — and, for a player,
 * the question of what their hero keeps, answered in a small form, changed or taken back at
 * will. Everyone's keepsakes are a press away. Nothing blocks: the question can be left.
 */
export function FinishedCard({
  api,
  ending,
  characterId,
  onOpenBook,
  onChanged,
}: {
  readonly api: WorldApi;
  readonly ending: EndingResponse;
  /** The character the player chooses for; null for a reader with none (the DM). */
  readonly characterId: string | null;
  readonly onOpenBook: () => void;
  readonly onChanged: () => void;
}) {
  const t = useT();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<'kept' | 'taken' | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const folded = useRef(false);
  useEffect(() => {
    if (!open && folded.current) opener.current?.focus();
    folded.current = false;
  }, [open]);
  const hero = ending.heroes.find((one) => one.entityId === characterId) ?? null;
  const mine = ending.keepsakes.find((kept) => kept.hero.entityId === characterId) ?? null;
  const fold = () => {
    folded.current = true;
    setOpen(false);
  };
  const choosing = hero !== null && open;
  return (
    <section className="previously-brief stars-card finished-card" aria-labelledby={`${ids}-title`}>
      <p className="previously-eyebrow" id={`${ids}-title`}>
        <Glyph name="chronicle" />
        {t('The adventure is finished')}
      </p>
      {/* While the keepsake is chosen the form stands alone: on a short screen its buttons stay in view. */}
      {!choosing && (
        <>
          <p className="stars-line">{t('The game is over. The whole story is in the book.')}</p>
          <ClosingWords ending={ending.ending} />
        </>
      )}
      {choosing ? (
        <KeepsakeForm
          api={api}
          characterId={hero.entityId}
          heroName={hero.name}
          kept={mine}
          onDone={(kept) => {
            setSaid(kept ? 'kept' : 'taken');
            onChanged();
            fold();
          }}
          onCancel={fold}
        />
      ) : (
        <>
          {hero !== null &&
            (mine ? (
              <dl className="stars-kept">
                <dt>{t('{hero} keeps', { hero: hero.name })}</dt>
                <dd>
                  {mine.kind === 'chapter'
                    ? t('The chapter “{what}”', { what: mine.label })
                    : mine.label}
                  {mine.line !== '' && <span className="keepsake-line">{mine.line}</span>}
                </dd>
              </dl>
            ) : (
              <p className="stars-line">
                {t('What does {hero} keep to remember it by?', { hero: hero.name })}
              </p>
            ))}
          <div className="action-row">
            {hero !== null && (
              <button
                ref={opener}
                type="button"
                className={mine ? undefined : 'primary-button'}
                onClick={() => {
                  setSaid(null);
                  setOpen(true);
                }}
              >
                {mine ? t('Change the keepsake') : t('Choose a keepsake')}
              </button>
            )}
            <button
              type="button"
              className={hero === null || mine ? 'primary-button' : undefined}
              onClick={onOpenBook}
            >
              {t('Open the book')}
            </button>
          </div>
        </>
      )}
      {/* Said to a screen reader when a choice was kept or taken back; the card shows it. */}
      <p role="status" className="visually-hidden">
        {said === 'kept' ? t('Kept.') : said === 'taken' ? t('Nothing is kept now.') : ''}
      </p>
      {ending.keepsakes.length > 0 && !choosing && (
        <details className="stars-so-far">
          <summary>
            {t('What the heroes keep: {count}', { count: ending.keepsakes.length })}
          </summary>
          <KeepsakeList keepsakes={ending.keepsakes} />
        </details>
      )}
    </section>
  );
}
