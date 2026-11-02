import { SESSION_DAYS, type NewAccount } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';

import { AboutButton } from '../guide/about.tsx';
import { Glyph } from '../visual/glyph.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';
import { ornamentUrl, textureUrl } from '../visual/ui-kit.ts';
import type { SignInAnswer } from './account-flow.ts';
import { AccountSignInForm, ResetForm } from './account-forms.tsx';
import { useDeliberateChoice } from './deliberate-choice.ts';
import { EMPTY_JOIN, JoinPanel, type JoinDraft } from './join-panel.tsx';
import { PersonaForm } from './login.tsx';
import { TableJoin } from './table-join.tsx';
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
        <div className="sign-in-foot">
          <p className="sign-in-footer">
            {t('Your character. Your perspective. One living world.')}
          </p>
          <AboutButton />
        </div>
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
 * The question before an invitation replaces this browser's sign-in (docs/STAGE_340_DESIGN.md
 * "Part B review fixes"). Keeping it is the first, primary and focused choice; replacing is
 * final — coming back takes a new invitation (the DM's from the operator) — so it is taken only
 * deliberately (`useDeliberateChoice`): until then it shows itself unavailable and ignores presses.
 */
function ReplaceQuestion({
  current,
  onKeep,
  onReplace,
}: {
  readonly current: CurrentSignIn | null;
  readonly onKeep: () => void;
  readonly onReplace: () => void;
}) {
  const t = useT();
  const keep = useRef<HTMLButtonElement>(null);
  const { armed, ready } = useDeliberateChoice(true);
  // The choice is brought into view with the focus: the question must be answered.
  useEffect(() => {
    keep.current?.focus();
  }, []);
  return (
    <>
      <CurrentSignInText current={current} />
      <p>{t('Replace that sign-in with this invitation?')}</p>
      <p className="fine-print">
        {t(
          'Replacing signs this browser out of that table. Keeping it leaves the invitation unused: it still works once, in another browser.',
        )}
      </p>
      <p className="fine-print">
        {current === null
          ? t('To come back to that table, you will need a new invitation link.')
          : current.role === 'DM'
            ? t(
                'To come back to that table as the DM, you will need a new invitation link from the operator.',
              )
            : t('To come back to that table, you will need a new invitation link from the DM.')}
      </p>
      <div className="action-row sign-in-actions">
        <button ref={keep} className="primary-button" onClick={onKeep}>
          <Glyph name="key" />
          {t('Keep my current sign-in')}
        </button>
        <button
          aria-disabled={!armed}
          onClick={() => {
            if (ready()) onReplace();
          }}
        >
          <Glyph name="replace" />
          {t('Replace with this invitation')}
        </button>
      </div>
    </>
  );
}

/**
 * Everything before a world (docs/adr/0036-production-sign-in.md §7; docs/adr/0041-accounts.md):
 * checking the sign-in, the development personas' form, an invitation waiting for the person to
 * take their seat (with a new login, theirs, or only this browser), joining, the question before
 * an invitation replaces this browser's sign-in, the one fixed message for any invitation that
 * cannot be used, signed out with signing in by login, and a reset link's new password. Nothing
 * here says why an invitation failed, and nothing here holds a token.
 */
export function SignInScreens({
  screen,
  onProbe,
  onBackToStart,
  onTakeSeat,
  onSignInAccount,
  onReset,
  onHub,
  onTableOffer,
  onTableChoose,
  onKeep,
  onReplace,
  onConnect,
}: {
  readonly screen: Exclude<SignInScreen, { readonly kind: 'session' } | { readonly kind: 'hub' }>;
  /** Ask the server again: try again. */
  readonly onProbe: () => void;
  readonly onBackToStart: () => void;
  readonly onTakeSeat: (newAccount: NewAccount | null) => void;
  readonly onSignInAccount: (login: string, password: string) => Promise<SignInAnswer>;
  readonly onReset: (password: string) => Promise<'done' | 'failed'>;
  readonly onHub: () => void;
  readonly onTableOffer: ComponentProps<typeof TableJoin>['onOffer'];
  readonly onTableChoose: ComponentProps<typeof TableJoin>['onChoose'];
  readonly onKeep: () => void;
  readonly onReplace: () => void;
  readonly onConnect: (campaignId: string, token: string) => void;
}) {
  const t = useT();
  // The join page's draft outlives a try the server sent back (joining, then invited again).
  const [join, setJoin] = useState<JoinDraft>(EMPTY_JOIN);
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
      case 'invited':
        return (
          <AccessState
            glyph="invitation"
            eyebrow={t('An invitation')}
            title={t('You are invited to a table')}
            focus={false}
          >
            <p>{t('This invitation link seats you at a table. It works once.')}</p>
            <p className="fine-print">
              {t(
                'Nothing is used until you take your seat. Take it only if you expected this invitation.',
              )}
            </p>
            <JoinPanel
              draft={join}
              onDraft={setJoin}
              problem={screen.problem}
              onTakeSeat={onTakeSeat}
              onSignInAccount={onSignInAccount}
              onHub={onHub}
            />
          </AccessState>
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
              <ReplaceQuestion current={screen.current} onKeep={onKeep} onReplace={onReplace} />
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
              <button onClick={onBackToStart}>{t('Back to the start')}</button>
            </div>
          </AccessState>
        );
      case 'signed-out':
        return screen.reason === 'none' ? (
          <AccessState
            glyph="sign-in"
            eyebrow={t('Welcome back')}
            title={t('Sign in to your table')}
            focus={screen.passwordChanged === true}
          >
            {screen.passwordChanged && (
              <p className="account-note" role="status">
                {t('Your new password is set. Sign in with it.')}
              </p>
            )}
            <AccountSignInForm onSignIn={onSignInAccount} />
            <p className="fine-print">
              {t(
                'New at the table? Open the invitation link your DM sent you: it seats you and makes your login.',
              )}
            </p>
            <p className="fine-print">
              {t(
                'An invitation link works once. A seat taken without a login stays in that browser for up to {days} days.',
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
            {screen.withAccount ? (
              <>
                <p>
                  {t('Your login is still signed in here: your other campaigns are a step away.')}
                </p>
                <div className="action-row">
                  <button className="primary-button" onClick={onHub}>
                    <Glyph name="party" />
                    {t('My campaigns')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>{t('Sign in with your login, or open a new invitation link.')}</p>
                <AccountSignInForm onSignIn={onSignInAccount} />
              </>
            )}
          </AccessState>
        );
      case 'table':
        return (
          <AccessState
            glyph="invitation"
            eyebrow={t('The table')}
            title={t('Join the table')}
            focus={false}
          >
            <TableJoin linked={screen.linked} onOffer={onTableOffer} onChoose={onTableChoose} />
          </AccessState>
        );
      case 'reset':
        return (
          <AccessState
            glyph="key"
            eyebrow={t('A password reset')}
            title={t('Set a new password')}
            focus={false}
          >
            <p>
              {t(
                'This link sets a new password for your login once. Your other devices sign in again.',
              )}
            </p>
            <ResetForm onReset={onReset} />
          </AccessState>
        );
    }
  }
}
