import type { CastResponse, DisplaySessionResponse, KnownEntitiesResponse } from '@ltw/contracts';
import { LanguageProvider, StatusPanel, useT, type Language } from '@ltw/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { WorldApi, type Connection } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useScreenAwake } from '../alerts/screen.ts';
import { useLiveSession } from '../session/use-live-session.ts';
import { ApprovedImages, ApprovedImagesContext } from '../visual/approved-images.ts';
import { ornamentUrl, textureUrl } from '../visual/ui-kit.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { CastView } from './cast-views.tsx';
import {
  forgetDisplay,
  readDisplaySession,
  requestPairing,
  spacedCode,
  type SessionAnswer,
} from './display-flow.ts';
import { WaitingStrip } from './waiting-strip.tsx';

/**
 * The table display (docs/adr/0042-table-display.md): a TV's browser opens `/display`, shows a
 * code until the DM pairs it, then shows what the DM casts — read only, in the PARTY perspective,
 * following the live signal. A screen that restarts comes back to what was cast (its cookie
 * stays); an unpaired one shows a new code. No account, no world controls, no WebGL.
 */
type Stage =
  | { readonly kind: 'checking' }
  | { readonly kind: 'pairing'; readonly code: string; readonly expiresAt: string }
  | {
      readonly kind: 'paired';
      readonly session: Extract<DisplaySessionResponse, { state: 'paired' }>;
    }
  | { readonly kind: 'limited' }
  | { readonly kind: 'unreachable' };

const POLL_MS = 2_000;
/** The quiet corner goes away when nobody has moved the pointer or pressed a key for this long. */
const IDLE_MS = 4_000;

const browserLanguage = (): Language =>
  navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';

export function DisplayApp({ transport = fetch }: { readonly transport?: typeof fetch }) {
  const [stage, setStage] = useState<Stage>({ kind: 'checking' });
  const generation = useRef(0);

  /** Pairs anew: a fresh code for the DM to type. */
  const pairAgain = useCallback(async () => {
    const mine = (generation.current += 1);
    const answer = await requestPairing(transport);
    if (mine !== generation.current) return;
    setStage(
      answer === 'limited'
        ? { kind: 'limited' }
        : answer === 'unreachable'
          ? { kind: 'unreachable' }
          : { kind: 'pairing', code: answer.code, expiresAt: answer.expiresAt },
    );
  }, [transport]);

  const settle = useCallback(
    (answer: SessionAnswer, waiting: boolean) => {
      if (answer === 'unreachable') {
        if (!waiting) setStage({ kind: 'unreachable' });
        return;
      }
      if (answer !== 'none' && answer.state === 'paired') {
        generation.current += 1;
        setStage({ kind: 'paired', session: answer });
        return;
      }
      // No session, or one whose code this page no longer holds: a new code.
      if (!waiting || answer === 'none') void pairAgain();
    },
    [pairAgain],
  );

  useEffect(() => {
    void readDisplaySession(transport).then((answer) => {
      settle(answer, false);
    });
  }, [transport, settle]);

  // While the code shows, the screen asks every two seconds whether the DM paired it.
  const waiting = stage.kind === 'pairing';
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      void readDisplaySession(transport).then((answer) => {
        settle(answer, true);
      });
    }, POLL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [waiting, transport, settle]);

  if (stage.kind === 'paired') {
    return (
      <LanguageProvider language={stage.session.language}>
        <DisplayStage
          session={stage.session}
          onLost={() => {
            setStage({ kind: 'checking' });
            void pairAgain();
          }}
          onForget={() => {
            void forgetDisplay(transport).then(pairAgain);
          }}
        />
      </LanguageProvider>
    );
  }
  return (
    <LanguageProvider language={browserLanguage()}>
      <Pairing stage={stage} onRetry={() => void pairAgain()} />
    </LanguageProvider>
  );
}

function Pairing({ stage, onRetry }: { readonly stage: Stage; readonly onRetry: () => void }) {
  const t = useT();
  return (
    <main className="display display--pairing">
      <img className="display-art" src={textureUrl('brand-keyart')} alt="" />
      <div className="display-scrim" aria-hidden="true" />
      <section className="display-pairing" aria-labelledby="pairing-title">
        <p className="display-brand">
          <img src={ornamentUrl('emblem')} alt="" />
          <span>{t('Living Tabletop World')}</span>
        </p>
        <h1 id="pairing-title">{t('The table’s screen')}</h1>
        {stage.kind === 'pairing' ? (
          <>
            <p>{t('On the DM’s screen, open Table screen and type this code:')}</p>
            <p className="display-code" aria-label={t('Pairing code {code}', { code: stage.code })}>
              {spacedCode(stage.code)}
            </p>
            <p className="display-hint">
              {t('The code works for ten minutes; a new one follows.')}
            </p>
          </>
        ) : stage.kind === 'checking' ? (
          <StatusPanel state="loading" label={t('Getting a code…')} />
        ) : (
          <div className="display-problem" role="alert">
            <p>
              {stage.kind === 'limited'
                ? t('Too many codes were asked for. Wait a minute, then try again.')
                : t('The table could not be reached. Check the connection, then try again.')}
            </p>
            <button className="primary-button" onClick={onRetry}>
              {t('Try again')}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

/** A paired screen: the DM's cast over the campaign's PARTY view, live. */
function DisplayStage({
  session,
  onLost,
  onForget,
}: {
  readonly session: Extract<DisplaySessionResponse, { state: 'paired' }>;
  readonly onLost: () => void;
  readonly onForget: () => void;
}) {
  const t = useT();
  const lost = useRef(onLost);
  lost.current = onLost;
  const connection = useMemo<Connection>(
    () => ({
      kind: 'session',
      campaignId: session.campaignId,
      // Unpaired or expired: the screen asks for a new code.
      onSignedOut: () => {
        lost.current();
      },
      onDoubt: () => undefined,
      onIdentity: () => undefined,
    }),
    [session.campaignId],
  );
  const api = useMemo(() => new WorldApi(connection, 'PARTY'), [connection]);
  const images = useMemo(() => new ApprovedImages(api), [api]);
  useEffect(
    () => () => {
      images.release();
    },
    [images],
  );
  const live = useLiveSession(connection, 'PARTY');
  // A paired screen stays awake (ADR 0044 §3): the TV never dims mid-game.
  useScreenAwake(true);
  const loadCast = useCallback(
    (signal: AbortSignal) => api.get<CastResponse>('display/cast', signal, false),
    [api],
  );
  const cast = useResource('display-cast', loadCast);
  useRereadOn(live.refresh, cast.reread);
  const loadNames = useCallback(
    (signal: AbortSignal) => api.get<KnownEntitiesResponse>('entities', signal),
    [api],
  );
  const names = useResource('display-names', loadNames);
  useRereadOn(live.refresh, names.reread);
  const directory = names.resource.status === 'ready' ? names.resource.value.entities : [];
  return (
    <ApprovedImagesContext.Provider value={images}>
      <main
        className="display"
        data-cast={cast.resource.status === 'ready' ? cast.resource.value.cast.kind : 'loading'}
      >
        {cast.resource.status === 'ready' ? (
          <>
            <CastView
              api={api}
              cast={cast.resource.value}
              directory={directory}
              refresh={live.refresh}
              campaignName={session.campaignName}
            />
            {/* The dice cast lists whom the table waits for itself; the join card is for joining. */}
            {!['dice', 'join'].includes(cast.resource.value.cast.kind) && (
              <WaitingStrip api={api} refresh={live.refresh} directory={directory} />
            )}
          </>
        ) : (
          <div className="display-wait">
            <StatusPanel
              state={cast.resource.status === 'error' ? 'error' : 'loading'}
              label={
                cast.resource.status === 'error'
                  ? cast.resource.message
                  : t('Opening the table’s screen…')
              }
              onRetry={cast.retry}
            />
          </div>
        )}
        <DisplayCorner name={session.name} onForget={onForget} />
      </main>
    </ApprovedImagesContext.Provider>
  );
}

/**
 * A quiet corner: full screen, and unpairing this screen (asked first). It shows while someone
 * moves the pointer or presses a key, then goes, so the room sees only the cast; focus inside it
 * keeps it.
 */
function DisplayCorner({
  name,
  onForget,
}: {
  readonly name: string;
  readonly onForget: () => void;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = window.setTimeout(() => {
      setIdle(true);
    }, IDLE_MS);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setIdle(true);
      }, IDLE_MS);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);
  return (
    <div className={idle && !asking ? 'display-corner is-idle' : 'display-corner'}>
      <span className="display-name">{name}</span>
      {document.fullscreenEnabled && (
        <button
          className="quiet-button"
          onClick={() => {
            void (document.fullscreenElement
              ? document.exitFullscreen()
              : document.documentElement.requestFullscreen());
          }}
        >
          {t('Full screen')}
        </button>
      )}
      {asking ? (
        <span className="display-confirm">
          {t('Unpair this screen?')}
          <button className="quiet-button" onClick={onForget}>
            {t('Unpair')}
          </button>
          <button
            className="quiet-button"
            onClick={() => {
              setAsking(false);
            }}
          >
            {t('Keep')}
          </button>
        </span>
      ) : (
        <button
          className="quiet-button"
          onClick={() => {
            setAsking(true);
          }}
        >
          {t('Unpair this screen')}
        </button>
      )}
    </div>
  );
}
