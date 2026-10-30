import { LanguageProvider, useT, type Language } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { InvitationHolder } from '../session/invitation-link.ts';
import { ornamentUrl, textureUrl } from '../visual/ui-kit.ts';
import { WorkshopAccess, type AccessKind } from './access.tsx';
import { WorkshopPrivate } from './private.tsx';
import type { WorkshopStart } from './start.ts';
import { joinWorkshop, probeWorkshop, workshopRequest, type WorkshopProbe } from './transport.ts';

type Screen =
  { readonly kind: AccessKind } | { readonly kind: 'workshop'; readonly ownerId: string };
export function WorkshopApp({ start }: { readonly start: WorkshopStart }) {
  const language: Language = navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  return (
    <LanguageProvider language={language}>
      <WorkshopPage start={start} language={language} />
    </LanguageProvider>
  );
}

function WorkshopPage({
  start,
  language,
}: {
  readonly start: WorkshopStart;
  readonly language: Language;
}) {
  const t = useT();
  const [screen, setScreen] = useState<Screen>({ kind: start.kind });
  const currentScreen = useRef(screen);
  currentScreen.current = screen;
  const invitation = useRef<InvitationHolder | null>(
    start.kind === 'invited' ? start.invitation : null,
  );
  const busy = useRef(false);
  const [asking, setAsking] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const question = useRef<HTMLDialogElement>(null);
  const stay = useRef<HTMLButtonElement>(null);
  const signOutButton = useRef<HTMLButtonElement>(null);
  const fromProbe = useCallback((result: WorkshopProbe) => {
    setScreen(
      result.kind === 'signed-in'
        ? { kind: 'workshop', ownerId: result.ownerId }
        : { kind: result.kind === 'signed-out' ? 'signed-out' : 'unreachable' },
    );
  }, []);
  const ended = useCallback(() => {
    flushSync(() => {
      setAsking(false);
      setRestricted(false);
      setScreen({ kind: 'signed-out' });
    });
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t('Campaign workshop');
  }, [language]);
  useEffect(() => {
    if (start.kind !== 'checking') return;
    let alive = true;
    void start.first.then((result) => {
      if (alive) fromProbe(result);
    });
    return () => {
      alive = false;
    };
  }, [start, fromProbe]);
  useEffect(() => {
    const hide = () => {
      invitation.current?.forget();
      invitation.current = null;
      // The history snapshot can be taken before React's native-event batch commits.
      flushSync(() => {
        setAsking(false);
        setRestricted(false);
        setScreen({ kind: 'checking' });
      });
    };
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) void probeWorkshop().then(fromProbe);
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [fromProbe]);
  useEffect(() => {
    if (asking) {
      question.current?.showModal();
      stay.current?.focus();
    } else if (question.current?.open) {
      question.current.close();
      signOutButton.current?.focus();
    }
  }, [asking]);
  const enter = async (replace: boolean) => {
    if (busy.current || invitation.current === null) return;
    busy.current = true;
    setScreen({ kind: 'joining' });
    const result = await joinWorkshop(invitation.current, replace);
    invitation.current = null;
    busy.current = false;
    if (result === 'joined') {
      window.location.replace('/workshop');
      return;
    }
    if (result === 'failed') {
      setScreen({ kind: 'failed' });
      return;
    }
    invitation.current = result.replacement;
    setScreen({ kind: 'confirm' });
  };
  const back = () => {
    invitation.current?.forget();
    invitation.current = null;
    window.location.replace('/workshop');
  };
  const leave = async () => {
    if (busy.current || screen.kind !== 'workshop') return;
    const ownerId = screen.ownerId;
    const stillCurrent = () =>
      currentScreen.current.kind === 'workshop' && currentScreen.current.ownerId === ownerId;
    busy.current = true;
    const response = await workshopRequest('/auth/sign-out', {}, undefined, ownerId);
    busy.current = false;
    if (!stillCurrent()) return;
    if (response?.status === 409) {
      const identity = await probeWorkshop();
      if (!stillCurrent()) return;
      if (
        identity.kind === 'signed-out' ||
        (identity.kind === 'signed-in' && identity.ownerId !== ownerId)
      )
        ended();
      else setSignOutFailed(true);
      return;
    }
    if (response?.ok || response?.status === 401) ended();
    else setSignOutFailed(true);
  };
  return (
    <main className="workshop">
      <img className="workshop-art" src={textureUrl('brand-keyart')} alt="" />
      <div className="workshop-scrim" aria-hidden="true" />
      <div className="workshop-content">
        {!restricted && (
          <header className="workshop-header">
            <div>
              <p className="workshop-brand">
                <img src={ornamentUrl('emblem')} alt="" />
                {t('Living Tabletop World')}
              </p>
              <h1>{t('Campaign workshop')}</h1>
              <p>{t('A place for the worlds you want to create.')}</p>
            </div>
            {screen.kind === 'workshop' && (
              <button
                ref={signOutButton}
                onClick={() => {
                  setSignOutFailed(false);
                  setAsking(true);
                }}
              >
                {t('Sign out of workshop')}
              </button>
            )}
          </header>
        )}
        {screen.kind === 'workshop' ? (
          <WorkshopPrivate
            key={screen.ownerId}
            ownerId={screen.ownerId}
            onEnded={ended}
            onRestricted={setRestricted}
          />
        ) : (
          <WorkshopAccess
            kind={screen.kind}
            onJoin={() => {
              void enter(false);
            }}
            onReplace={() => {
              void enter(true);
            }}
            onKeep={back}
            onRetry={() => {
              setScreen({ kind: 'checking' });
              void probeWorkshop().then(fromProbe);
            }}
          />
        )}
      </div>
      {!restricted && (
        <dialog
          ref={question}
          className="sign-out-dialog"
          onCancel={(event) => {
            event.preventDefault();
            setAsking(false);
          }}
          aria-labelledby="workshop-sign-out-title"
        >
          <h2 id="workshop-sign-out-title">{t('Sign out of workshop?')}</h2>
          <p>{t('Your drafts stay saved. To return, open a new workshop invitation.')}</p>
          {signOutFailed && <p role="alert">{t('The workshop could not be reached')}</p>}
          <div className="workshop-actions">
            <button
              ref={stay}
              className="primary-button"
              onClick={() => {
                setAsking(false);
              }}
            >
              {t('Stay signed in')}
            </button>
            <button
              onClick={() => {
                void leave();
              }}
            >
              {t('Sign out of workshop')}
            </button>
          </div>
        </dialog>
      )}
    </main>
  );
}
