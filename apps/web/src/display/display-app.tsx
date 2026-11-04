import type {
  CastResponse,
  DisplaySessionResponse,
  KnownEntitiesResponse,
  LobbyResponse,
} from '@ltw/contracts';
import { LanguageProvider, StatusPanel, useT, type Language } from '@ltw/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { WorldApi, type Connection } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useScreenAwake } from '../alerts/screen.ts';
import { TableMusic } from '../audio/table-music.tsx';
import { TableAmbience } from '../audio/table-sound.tsx';
import { onForgetAsked, reportToHost } from '../native/tv-report.ts';
import { useLiveSession } from '../session/use-live-session.ts';
import { ApprovedImages, ApprovedImagesContext } from '../visual/approved-images.ts';
import { ornamentUrl, textureUrl } from '../visual/ui-kit.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { BigRoll } from './big-roll.tsx';
import { CastView } from './cast-views.tsx';
import { DisplayCorner } from './display-corner.tsx';
import { castKey } from './moments.ts';
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

  // Hosted by LTW DM on its TV, the screen tells the app its code, or the campaign it is paired
  // with (docs/adr/0070-native-apps.md §6), so the DM pairs it with one press — and asked to show
  // another campaign, it forgets its pairing and shows a new code.
  const code = stage.kind === 'pairing' ? stage.code : null;
  const campaign = stage.kind === 'paired' ? stage.session.campaignId : null;
  useEffect(() => {
    reportToHost(
      code !== null
        ? { kind: 'pairing', code }
        : campaign !== null
          ? { kind: 'paired', campaign }
          : null,
    );
  }, [code, campaign]);
  useEffect(
    () =>
      onForgetAsked(() => {
        void forgetDisplay(transport).then(pairAgain);
      }),
    [transport, pairAgain],
  );

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
  const scenePlaceId =
    names.resource.status === 'ready' ? (names.resource.value.scenePlaceId ?? null) : null;
  // The live stream follows the place the screen shows — the cast's scene, else where the scene
  // is played — so its weather and hour reach the screen and the table's sound as they change.
  const castPlace =
    cast.resource.status === 'ready' && cast.resource.value.cast.kind === 'scene'
      ? (cast.resource.value.place ?? null)
      : null;
  const followed = castPlace ?? scenePlaceId;
  const { report } = live;
  useEffect(() => {
    report(null, followed);
  }, [report, followed]);
  // What the table hears (docs/adr/0059-atmosphere.md §1): the DM's choice, from the table's state.
  const loadLobby = useCallback(
    (signal: AbortSignal) => api.get<LobbyResponse>('lobby', signal),
    [api],
  );
  const lobby = useResource('display-lobby', loadLobby);
  useRereadOn(live.refresh, lobby.reread);
  const table = lobby.resource.status === 'ready' ? lobby.resource.value : null;
  const choice = table?.sound.ambience ?? null;
  return (
    <ApprovedImagesContext.Provider value={images}>
      <main
        className="display"
        data-cast={cast.resource.status === 'ready' ? cast.resource.value.cast.kind : 'loading'}
      >
        {cast.resource.status === 'ready' ? (
          <>
            {/* Another cast fades in (ADR 0059 §4); a battlefield's zoom or focus does not. */}
            <div key={castKey(cast.resource.value)} className="display-cast">
              <CastView
                api={api}
                cast={cast.resource.value}
                directory={directory}
                refresh={live.refresh}
                campaignName={session.campaignName}
              />
            </div>
            {/* The dice cast lists whom the table waits for itself; the join card is for joining. */}
            {!['dice', 'join'].includes(cast.resource.value.cast.kind) && (
              <WaitingStrip api={api} refresh={live.refresh} directory={directory} />
            )}
            {/* A roll the table may see, big over the cast; a plate beside the battlefield. */}
            <BigRoll
              api={api}
              refresh={live.refresh}
              compact={cast.resource.value.cast.kind === 'battlefield'}
            />
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
        <TableAmbience api={api} refresh={live.refresh} choice={choice} placeId={scenePlaceId} />
        <TableMusic api={api} music={table?.sound.music ?? null} />
        <DisplayCorner name={session.name} onForget={onForget} />
      </main>
    </ApprovedImagesContext.Provider>
  );
}
