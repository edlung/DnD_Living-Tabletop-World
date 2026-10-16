import { SESSION_DAYS } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useEffect, useRef, type ReactNode } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';
import { ornamentUrl, textureUrl } from '../visual/ui-kit.ts';
import { PersonaForm } from './login.tsx';
import type { CurrentSignIn } from './sign-in-flow.ts';
import type { SignInScreen } from './use-sign-in.ts';

/**
 * Sign-in's frame (docs/STAGE_320_DESIGN.md §5.8): the GPT key art full-bleed behind a glass
 * panel with the emblem, wordmark and tagline; what the panel asks or says comes below.
 */
export function SignInLayout({ children }: { readonly children: ReactNode }) {
  const t = useT();
  return (
    <main className="sign-in">
      <img className="sign-in-art" src={textureUrl('brand-keyart')} alt="" />
      <div className="sign-in-scrim" aria-hidden="true" />
      <section className="sign-in-panel" aria-labelledby="entry-title">
        <p className="sign-in-brand">
          <img src={ornamentUrl('emblem')} alt="" />
          <span>{t('Living Tabletop World')}</span>
        </p>
        <div className="sign-in-story">
          <p className="eyebrow">{t('A world worth returning to')}</p>
          <h1 id="entry-title">
            {t('Every place')} <br />
            {t('has a story.')}
          </h1>
          <p>
            {t(
              'Step into your shared world. See what your character knows, explore the details, and keep your story close.',
            )}
          </p>
        </div>
        <img className="sign-in-divider" src={ornamentUrl('divider')} alt="" />
        {children}
        <p className="sign-in-footer">{t('Your character. Your perspective. One living world.')}</p>
      </section>
    </main>
  );
}

/**
 * One state of the panel: its eyebrow with a glyph, its title and what follows. A state the
 * person reached by doing something takes focus on its title, so it is read out where they are.
 */
function AccessState({
  glyph,
  eyebrow,
  title,
  focus,
  children,
}: {
  readonly glyph: GlyphName;
  readonly eyebrow: string;
  readonly title: string;
  readonly focus: boolean;
  readonly children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) heading.current?.focus({ preventScroll: true });
  }, [focus]);
  return (
    <div className="sign-in-form sign-in-state" role="group" aria-labelledby="access-title">
      <p className="eyebrow sign-in-eyebrow">
        <Glyph name={glyph} />
        {eyebrow}
      </p>
      <h2 id="access-title" ref={heading} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function CurrentSignInText({ current }: { readonly current: CurrentSignIn | null }) {
  const t = useT();
  if (current === null) return <p>{t('This browser is already signed in to a table.')}</p>;
  return (
    <p>
      {current.role === 'DM'
        ? t('You are signed in to “{campaign}” as the DM.', { campaign: current.campaignName })
        : t('You are signed in to “{campaign}” as {character}.', {
            campaign: current.campaignName,
            character: current.characterName ?? t('a player'),
          })}
    </p>
  );
}

/**
 * Everything before a world (docs/adr/0036-production-sign-in.md §7): checking the sign-in, the
 * development personas' form, joining by invitation, the question before an invitation replaces
 * this browser's sign-in, the one fixed message for any invitation that cannot be used, and
 * signed out. Nothing here says why an invitation failed.
 */
export function SignInScreens({
  screen,
  onProbe,
  onReplace,
  onConnect,
}: {
  readonly screen: Exclude<SignInScreen, { readonly kind: 'session' }>;
  /** Ask the server again: try again, back to the start, keep the current sign-in. */
  readonly onProbe: () => void;
  readonly onReplace: () => void;
  readonly onConnect: (campaignId: string, token: string) => void;
}) {
  const t = useT();
  return <SignInLayout>{content()}</SignInLayout>;

  function content(): ReactNode {
    switch (screen.kind) {
      case 'personas':
        return <PersonaForm onConnect={onConnect} />;
      case 'checking':
        return (
          <div className="sign-in-form sign-in-state">
            <StatusPanel state="loading" label={t('Checking your sign-in…')} />
          </div>
        );
      case 'joining':
        return (
          <AccessState
            glyph="invitation"
            eyebrow={t('An invitation')}
            title={t('Joining the table')}
            focus={false}
          >
            <StatusPanel state="loading" label={t('Checking your invitation…')} />
          </AccessState>
        );
      case 'unreachable':
        return (
          <AccessState
            glyph="offline"
            eyebrow={t('Take your seat')}
            title={t('The table could not be reached')}
            focus
          >
            <p>{t('Check your connection, then try again.')}</p>
            <div className="action-row">
              <button className="primary-button" onClick={onProbe}>
                <Glyph name="refresh" />
                {t('Try again')}
              </button>
            </div>
          </AccessState>
        );
      case 'confirm':
        return (
          <AccessState
            glyph="key"
            eyebrow={t('Already signed in')}
            title={t('Replace your sign-in?')}
            focus
          >
            {screen.current === undefined ? (
              <StatusPanel state="loading" label={t('Reading your current sign-in…')} />
            ) : (
              <>
                <CurrentSignInText current={screen.current} />
                <p>{t('Replace that sign-in with this invitation?')}</p>
                <p className="fine-print">
                  {t(
                    'Replacing signs this browser out of that table. Keeping it leaves the invitation unused: it still works once, in another browser.',
                  )}
                </p>
                <div className="action-row sign-in-actions">
                  <button className="primary-button" onClick={onReplace}>
                    <Glyph name="replace" />
                    {t('Replace with this invitation')}
                  </button>
                  <button onClick={onProbe}>
                    <Glyph name="key" />
                    {t('Keep my current sign-in')}
                  </button>
                </div>
              </>
            )}
          </AccessState>
        );
      case 'join-failed':
        return (
          <AccessState
            glyph="invitation"
            eyebrow={t('An invitation')}
            title={t('This invitation cannot be used')}
            focus
          >
            <p>{t('Invitation links work once and expire after a while. Ask for a new one.')}</p>
            <div className="action-row">
              <button onClick={onProbe}>{t('Back to the start')}</button>
            </div>
          </AccessState>
        );
      case 'signed-out':
        return screen.reason === 'none' ? (
          <AccessState
            glyph="invitation"
            eyebrow={t('Take your seat')}
            title={t('Join with an invitation')}
            focus={false}
          >
            <p>
              {t(
                'This table is open to invited players. Open the invitation link you were sent to take your seat.',
              )}
            </p>
            <p className="fine-print">
              {t(
                'An invitation link works once. Signing in keeps you at the table in this browser for up to {days} days.',
                { days: SESSION_DAYS },
              )}
            </p>
          </AccessState>
        ) : (
          <AccessState
            glyph="leave"
            eyebrow={t('Signed out')}
            title={t('You are signed out')}
            focus
          >
            <p>{t('To come back to the table, open a new invitation link.')}</p>
          </AccessState>
        );
    }
  }
}
