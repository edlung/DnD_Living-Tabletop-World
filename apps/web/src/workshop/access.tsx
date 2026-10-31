import { StatusPanel, useT } from '@ltw/ui';
import { useEffect, useRef } from 'react';

import { useDeliberateChoice } from '../session/deliberate-choice.ts';

export type AccessKind =
  'invited' | 'joining' | 'failed' | 'signed-out' | 'unreachable' | 'checking' | 'confirm';
export function WorkshopAccess({
  kind,
  onJoin,
  onKeep,
  onReplace,
  onRetry,
}: {
  readonly kind: AccessKind;
  readonly onJoin: () => void;
  readonly onKeep: () => void;
  readonly onReplace: () => void;
  readonly onRetry: () => void;
}) {
  const t = useT();
  const keep = useRef<HTMLButtonElement>(null);
  const { armed, ready } = useDeliberateChoice(kind === 'confirm');
  useEffect(() => {
    if (kind === 'confirm') keep.current?.focus();
  }, [kind]);
  if (kind === 'checking' || kind === 'joining')
    return <StatusPanel state="loading" label={t('Opening your workshop…')} />;
  if (kind === 'invited')
    return (
      <section className="workshop-access" aria-labelledby="workshop-access-title">
        <h2 id="workshop-access-title">{t('You are invited to a workshop')}</h2>
        <p>{t('Keep your campaign ideas and drafts together in your private workshop.')}</p>
        <p>{t('The invitation is used only when you choose to enter.')}</p>
        <button className="primary-button" onClick={onJoin}>
          {t('Enter the workshop')}
        </button>
      </section>
    );
  if (kind === 'confirm')
    return (
      <section className="workshop-access" aria-labelledby="workshop-access-title">
        <h2 id="workshop-access-title">{t('Replace your workshop sign-in?')}</h2>
        <p>{t('This browser already has a workshop open. Your game session stays separate.')}</p>
        <p>
          {t(
            'Keeping it leaves this invitation unused. Replacing it opens the invited workshop instead.',
          )}
        </p>
        <div className="workshop-actions">
          <button ref={keep} className="primary-button" onClick={onKeep}>
            {t('Keep my workshop')}
          </button>
          <button
            aria-disabled={!armed}
            onClick={() => {
              if (ready()) onReplace();
            }}
          >
            {t('Open the invited workshop')}
          </button>
        </div>
      </section>
    );
  if (kind === 'failed')
    return (
      <section className="workshop-access" aria-labelledby="workshop-access-title">
        <h2 id="workshop-access-title">{t('This invitation cannot be used')}</h2>
        <p>{t('Invitation links work once and expire after a while. Ask for a new one.')}</p>
        <button onClick={onKeep}>{t('Back to the workshop')}</button>
      </section>
    );
  if (kind === 'unreachable')
    return (
      <section className="workshop-access" aria-labelledby="workshop-access-title">
        <h2 id="workshop-access-title">{t('The workshop could not be reached')}</h2>
        <p>{t('Check your connection, then try again.')}</p>
        <button className="primary-button" onClick={onRetry}>
          {t('Try again')}
        </button>
      </section>
    );
  return (
    <section className="workshop-access" aria-labelledby="workshop-access-title">
      <h2 id="workshop-access-title">{t('Open your workshop with an invitation')}</h2>
      <p>{t('Your workshop is private. Open an invitation link to sign in to it.')}</p>
    </section>
  );
}
