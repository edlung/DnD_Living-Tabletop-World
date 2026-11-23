import type { CampaignLibraryEntry } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useId, useRef } from 'react';

import { Glyph } from '../visual/glyph.tsx';

/**
 * "Look inside" a library campaign (docs/adr/0075-book-interface.md §10): its first page, opened
 * over the shelf as a modal dialog on the book's paper — the cover picture, what it is and who it
 * is for, the whole pitch, the party size and the press that starts it with the account as its DM.
 * Escape or "Close" closes it as a native dialog does; the shelf then puts focus back on the
 * label's "Look inside the book", even when the pointer opened it from the book itself.
 */
export function LibraryLook({
  campaign,
  picture,
  variant,
  busy,
  mine,
  onVariant,
  onStart,
  onClose,
}: {
  readonly campaign: CampaignLibraryEntry;
  readonly picture: string;
  readonly variant: string;
  /** Something is being opened or made: nothing else may start. */
  readonly busy: boolean;
  /** This campaign is the one being made. */
  readonly mine: boolean;
  readonly onVariant: (variantId: string) => void;
  readonly onStart: () => void;
  readonly onClose: () => void;
}) {
  const t = useT();
  const ids = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  const select = `${ids}-players`;
  return (
    <dialog
      ref={ref}
      className="library-look"
      aria-labelledby={`${ids}-title`}
      data-surface="paper"
      onCancel={(event) => {
        // While the campaign is being made the page stays: there is nothing to go back to.
        if (mine) event.preventDefault();
      }}
      onClose={onClose}
    >
      <img className="library-look-plate" src={picture} alt="" width={300} height={200} />
      <div className="library-look-page">
        <h2 id={`${ids}-title`}>{campaign.title}</h2>
        <p className="hub-library-meta">
          {campaign.genre} · {campaign.audience}
        </p>
        <p className="library-look-pitch">{campaign.pitch}</p>
        <div className="hub-library-actions">
          <label htmlFor={select}>{t('Players')}</label>
          <select
            id={select}
            value={variant}
            disabled={busy}
            onChange={(event) => {
              onVariant(event.target.value);
            }}
          >
            {campaign.variants.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        {mine && (
          <p className="hub-library-wait" role="status">
            {t('This takes up to a minute or two: the world and its pictures are set up.')}
          </p>
        )}
        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            aria-label={t('Start «{title}»', { title: campaign.title })}
            onClick={onStart}
          >
            <Glyph name="chronicle" />
            {mine ? t('Preparing the campaign…') : t('Start')}
          </button>
          <button
            type="button"
            disabled={mine}
            onClick={() => {
              ref.current?.close();
            }}
          >
            {t('Close')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
