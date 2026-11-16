import { AGREEMENT_LIMITS, type AgreementView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useLayoutEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { Glyph } from '../visual/glyph.tsx';
import { IconButton } from '../visual/icon-button.tsx';
import { limitWords, sayUnderstood, toneWords, useAgreement } from './agreement-words.ts';

/**
 * The table's agreement as everyone reads it (docs/adr/0071-memory-and-ritual.md §4): how the
 * table plays, what is not in its game, how to ask for a pause, who plays. The same page in a
 * player's lobby, in "How to play", on the DM's sheet and on the table's screen.
 */
export function AgreementPage({ agreement }: { readonly agreement: AgreementView }) {
  const t = useT();
  const own = agreement.alsoNot
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return (
    <dl className="agreement-page">
      <dt>{t('How we play')}</dt>
      <dd>
        {toneWords(t, agreement.tone)}
        {agreement.toneNote !== '' && <span className="agreement-own">{agreement.toneNote}</span>}
      </dd>
      {(agreement.limits.length > 0 || own.length > 0) && (
        <>
          <dt>{t('Not in this game')}</dt>
          <dd>
            <ul className={agreement.limits.length + own.length > 6 ? 'agreement-many' : ''}>
              {/* In the order the DM ticked them from, whatever order they were kept in. */}
              {AGREEMENT_LIMITS.filter((limit) => agreement.limits.includes(limit)).map((limit) => (
                <li key={limit}>{limitWords(t, limit)}</li>
              ))}
              {own.map((line, index) => (
                // The table's own lines may repeat: their place is their key.
                <li key={`${String(index)}:${line}`}>{line}</li>
              ))}
            </ul>
          </dd>
        </>
      )}
      <dt>{t('If you need a pause')}</dt>
      <dd>
        {agreement.pauseSign !== ''
          ? agreement.pauseSign
          : t('Say “pause”. The game stops, and nobody has to explain why.')}
      </dd>
      {agreement.ages !== '' && (
        <>
          <dt>{t('Who plays')}</dt>
          <dd>{agreement.ages}</dd>
        </>
      )}
    </dl>
  );
}

/**
 * A player's card in the lobby while they have not said "Understood" to the agreement as it
 * stands: before their first evening, and again when the DM changes the words — in the lobby and
 * over a game in play alike, since a campaign may begin with its first session open. Reading opens
 * a dialog; nothing blocks play — "Later" puts the card away until the screen is opened again.
 */
export function AgreementCard({
  api,
  characterId,
}: {
  readonly api: WorldApi;
  /** The character the player says "Understood" for. */
  readonly characterId: string;
}) {
  const t = useT();
  const ids = useId();
  const { answer, reread } = useAgreement(api);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'busy' | 'failed' | null>(null);
  // "Later": put away until this screen is opened again — a fight is not the moment.
  const [later, setLater] = useState(false);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  const agreement = answer?.agreement ?? null;
  if (agreement === null || answer?.understood !== false || later) return null;
  const understood = async () => {
    if (state === 'busy') return;
    setState('busy');
    const said = await sayUnderstood(api, agreement.version, characterId);
    setState(said ? null : 'failed');
    // Whether it went through or the words changed meanwhile: the card reads the page again.
    reread();
    if (said) setOpen(false);
  };
  return (
    <>
      <section className="previously-brief agreement-card" aria-labelledby={`${ids}-card`}>
        <p className="previously-eyebrow" id={`${ids}-card`}>
          <Glyph name="ask" />
          {t('The table’s agreement')}
        </p>
        <p>
          {agreement.version > 1
            ? t('Read the table’s agreement before the next game — the DM has updated it.')
            : t('Before you play: how this table plays, and how to ask for a pause.')}
        </p>
        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            aria-haspopup="dialog"
            onClick={() => {
              setOpen(true);
            }}
          >
            {t('Read it')}
          </button>
          <button
            type="button"
            onClick={() => {
              setLater(true);
            }}
          >
            {t('Later')}
          </button>
        </div>
      </section>
      {/* Beside the card, not in it: the page is read in the dialog's own colours. */}
      <dialog
        ref={dialog}
        className="guide-dialog agreement-dialog"
        aria-labelledby={`${ids}-title`}
        onClose={() => {
          setOpen(false);
        }}
      >
        <header className="guide-header">
          <h2 id={`${ids}-title`}>{t('The table’s agreement')}</h2>
          <IconButton
            glyph="close"
            label={t('Close')}
            onClick={() => {
              setOpen(false);
            }}
          />
        </header>
        {/* It may scroll on a short screen: the keyboard reaches it. */}
        <section className="guide-page" tabIndex={0} aria-labelledby={`${ids}-title`}>
          <AgreementPage agreement={agreement} />
          {state === 'failed' && (
            <p role="alert" className="authoring-notice error">
              {t('That did not go through. The page may have changed: read it and try again.')}
            </p>
          )}
        </section>
        <footer className="guide-footer">
          <span className="guide-step">
            {t('The agreement and “Ask for a pause” stay in “How to play”.')}
          </span>
          <div className="action-row">
            <button
              type="button"
              className="primary-button"
              aria-disabled={state === 'busy'}
              onClick={() => void understood()}
            >
              {t('Understood')}
            </button>
          </div>
        </footer>
      </dialog>
    </>
  );
}

/** The agreement on the table's screen, for the first meeting: the DM reads it aloud. */
export function AgreementCast({
  api,
  refresh,
}: {
  readonly api: WorldApi;
  /** The screen's live signal. */
  readonly refresh: number;
}) {
  const t = useT();
  const { answer } = useAgreement(api, refresh);
  const agreement = answer?.agreement ?? null;
  return (
    <section className="display-stars display-agreement" aria-label={t('The table’s agreement')}>
      <div className="display-stars-page">
        <p className="previously-eyebrow">{t('The table’s agreement')}</p>
        {agreement ? (
          <>
            <AgreementPage agreement={agreement} />
            <p className="display-agreement-then">
              {t('Then everyone presses “Understood” on their own screen.')}
            </p>
          </>
        ) : (
          <p className="display-stars-prompt">{t('The DM has not written it yet.')}</p>
        )}
      </div>
    </section>
  );
}
