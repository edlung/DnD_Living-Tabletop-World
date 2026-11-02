import type { SessionResponse } from '@ltw/contracts';
import { LanguageProvider, StatusPanel, useLanguage, useT, type Language } from '@ltw/ui';
import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { WorldApi, type Connection } from '../api/client.ts';
import { LiveActiveContext, LiveRefreshContext, LiveTargetContext } from '../api/live-context.ts';
import { useResource } from '../api/resource.ts';
import type { StandIn } from '../combat/stand-in.ts';
import { TopBar } from '../shell/top-bar.tsx';
import { ornamentUrl } from '../visual/ui-kit.ts';
import { World } from '../world/world.tsx';
import { ActingBar } from './acting-bar.tsx';
import { SessionAccountProvider } from './account-menu.tsx';
import { HubPage } from './hub.tsx';
import type { PageStart } from './sign-in-flow.ts';
import { SignInKindContext, useSignInKind } from './sign-in-kind.ts';
import { SignInScreens } from './sign-in-screens.tsx';
import { SignOutDialog } from './sign-out-dialog.tsx';
import { useLiveSession } from './use-live-session.ts';
import { useSignIn } from './use-sign-in.ts';

/** The page speaks the language of what it shows: the browser's, then the campaign's. */
function DocumentLanguage() {
  const language = useLanguage();
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = language;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [language]);
  return null;
}

function Emblem() {
  const t = useT();
  return (
    <p className="connection-brand">
      <img src={ornamentUrl('emblem')} alt="" />
      <span>{t('Living Tabletop World')}</span>
    </p>
  );
}

/** Leaving: a development persona leaves the session; a signed-in browser signs out. */
function LeaveButton({ onLeave }: { readonly onLeave: () => void }) {
  const t = useT();
  return (
    <button onClick={onLeave}>
      {useSignInKind() === 'session' ? t('Sign out') : t('Leave session')}
    </button>
  );
}

function BoundaryFallback({ onLeave }: { readonly onLeave: () => void }) {
  const t = useT();
  return (
    <main className="connection-state">
      <Emblem />
      <StatusPanel
        state="error"
        label={t('This world response could not be displayed. Reconnect to try again.')}
      />
      <LeaveButton onLeave={onLeave} />
    </main>
  );
}

/** Last-resort malformed-response boundary; no stale projection survives. */
class SessionBoundary extends Component<
  { children: ReactNode; onLeave: () => void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <BoundaryFallback onLeave={this.props.onLeave} />
    ) : (
      this.props.children
    );
  }
}

function browserLanguage(): Language {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ru')
    ? 'ru'
    : 'en';
}

/**
 * The page (docs/adr/0036-production-sign-in.md §7, docs/adr/0041-accounts.md): sign-in, the
 * account's hub, then a world. With production sign-in the browser holds HttpOnly cookies and the
 * screens below never see a credential; development personas type a token, kept in memory. Before a session names the
 * campaign's language the browser's speaks, and a session that ended keeps its campaign's.
 * Every identity a session's screens read is told to its connection: the first is what this tab
 * shows, and another one later signs the tab out (`sign-in-watch.ts`).
 */
export function App({ start }: { readonly start: PageStart }) {
  const flow = useSignIn(start);
  const [campaignLanguage, setCampaignLanguage] = useState<Language | null>(null);
  const { screen } = flow;
  const browser = browserLanguage();
  if (screen.kind === 'hub') {
    return (
      <LanguageProvider language={browser}>
        <DocumentLanguage />
        <HubPage
          onOpen={flow.openCampaign}
          onCreate={flow.createCampaign}
          onSignOut={flow.signOutAccount}
        />
      </LanguageProvider>
    );
  }
  if (screen.kind !== 'session') {
    const ended = screen.kind === 'signed-out' && screen.reason !== 'none';
    return (
      <LanguageProvider language={ended ? (campaignLanguage ?? browser) : browser}>
        <DocumentLanguage />
        <SignInScreens
          screen={screen}
          onProbe={flow.probe}
          onBackToStart={flow.backToStart}
          onTakeSeat={flow.takeSeat}
          onSignInAccount={flow.signInAccount}
          onReset={flow.resetWith}
          onHub={flow.toHub}
          onTableOffer={flow.tableOffer}
          onTableChoose={flow.tableChoose}
          onKeep={flow.keep}
          onReplace={flow.replace}
          onConnect={flow.connectPersona}
        />
      </LanguageProvider>
    );
  }
  const { connection } = screen;
  return (
    <LanguageProvider language={browser}>
      <DocumentLanguage />
      <SignInKindContext.Provider value={connection.kind}>
        <SessionAccountProvider
          key={screen.key}
          enabled={connection.kind === 'session'}
          onHub={flow.toHub}
        >
          <SessionBoundary key={screen.key} onLeave={flow.leave}>
            <SessionGate
              connection={connection}
              onLeave={flow.leave}
              onLanguage={setCampaignLanguage}
            />
          </SessionBoundary>
          {connection.kind === 'session' && (
            <LanguageProvider language={campaignLanguage ?? browser}>
              <SignOutDialog
                key={screen.key}
                connection={connection}
                open={flow.askingSignOut}
                onCancel={flow.cancelSignOut}
                onSignedOut={flow.signedOut}
              />
            </LanguageProvider>
          )}
        </SessionAccountProvider>
      </SignInKindContext.Provider>
    </LanguageProvider>
  );
}

/** Tells a signed-in session's connection each identity read for it. */
function useIdentityReport(connection: Connection, identity: SessionResponse | null): void {
  useEffect(() => {
    if (identity !== null && connection.kind === 'session') connection.onIdentity(identity);
  }, [connection, identity]);
}

function SessionGate({
  connection,
  onLeave,
  onLanguage,
}: {
  readonly connection: Connection;
  readonly onLeave: () => void;
  /** The campaign's language, once its identity is read. */
  readonly onLanguage: (language: Language) => void;
}) {
  const t = useT();
  const api = useMemo(() => new WorldApi(connection, ''), [connection]);
  const load = useCallback(
    (signal: AbortSignal) => api.get<SessionResponse>('session', signal, false),
    [api],
  );
  const { resource, retry } = useResource('identity', load);
  const identity = resource.status === 'ready' ? resource.value : null;
  useIdentityReport(connection, identity);
  const language = identity?.campaign.language ?? null;
  useEffect(() => {
    if (language !== null) onLanguage(language);
  }, [language, onLanguage]);
  if (resource.status !== 'ready')
    return (
      <main className="connection-state">
        <Emblem />
        <StatusPanel
          state={resource.status}
          label={resource.status === 'error' ? resource.message : t('Opening your session…')}
          onRetry={retry}
        />
        <LeaveButton onLeave={onLeave} />
      </main>
    );
  // From here on the campaign's own language speaks, whatever the browser's is.
  return (
    <LanguageProvider language={resource.value.campaign.language}>
      <DocumentLanguage />
      <SessionWorld connection={connection} identity={resource.value} onLeave={onLeave} />
    </LanguageProvider>
  );
}

/**
 * The session screen owns the one live connection (docs/adr/0033-live-session.md §4): every
 * view below re-reads in the background on its signals, and the world screen tells it what is
 * selected and viewed. It also holds the DM's choice to act as a player's character (§6): the
 * DM then holds that character's perspective until stopping or choosing another one.
 */
function SessionWorld({
  connection,
  identity,
  onLeave,
}: {
  readonly connection: Connection;
  readonly identity: SessionResponse;
  readonly onLeave: () => void;
}) {
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const [perspective, setPerspective] = useState(identity.perspectives[0]?.value ?? 'PUBLIC');
  const [standIn, setStandIn] = useState<StandIn | null>(null);
  const live = useLiveSession(connection, perspective);
  const choose = (value: string, acting: StandIn | null = null) => {
    live.report(null, null);
    setStandIn(acting);
    setPerspective(value);
  };
  return (
    <LiveActiveContext.Provider value={true}>
      <LiveRefreshContext.Provider value={live.refresh}>
        <LiveTargetContext.Provider value={live.report}>
          <SessionShell
            connection={connection}
            initial={identity}
            perspective={perspective}
            onPerspective={(value) => {
              choose(value);
            }}
            standIn={standIn}
            onActAs={(acting) => {
              choose(`CHARACTER:${acting.characterId}`, acting);
            }}
            onStopActing={() => {
              choose('DM');
            }}
            status={live.status}
            onLeave={onLeave}
          />
        </LiveTargetContext.Provider>
      </LiveRefreshContext.Provider>
    </LiveActiveContext.Provider>
  );
}

function SessionShell({
  connection,
  initial,
  perspective,
  onPerspective,
  standIn,
  onActAs,
  onStopActing,
  status,
  onLeave,
}: {
  readonly connection: Connection;
  readonly initial: SessionResponse;
  readonly perspective: string;
  readonly onPerspective: (perspective: string) => void;
  readonly standIn: StandIn | null;
  readonly onActAs: (standIn: StandIn) => void;
  readonly onStopActing: () => void;
  readonly status: ReturnType<typeof useLiveSession>['status'];
  readonly onLeave: () => void;
}) {
  const t = useT();
  const [revision, setRevision] = useState(0);
  // The top bar's place for the open play session, written in by the world screen.
  const [sessionSlot, setSessionSlot] = useState<HTMLSpanElement | null>(null);
  // The caller's identity is re-read in the background like every other view.
  const identityApi = useMemo(() => new WorldApi(connection, ''), [connection]);
  const loadIdentity = useCallback(
    (signal: AbortSignal) => identityApi.get<SessionResponse>('session', signal, false),
    [identityApi],
  );
  const { resource } = useResource('identity', loadIdentity);
  useIdentityReport(connection, resource.status === 'ready' ? resource.value : null);
  const identity = resource.status === 'ready' ? resource.value : initial;
  const effective =
    perspective === 'PLAYER' ? `CHARACTER:${identity.character?.entityId ?? ''}` : perspective;
  // Names/IDs of other DM-only characters must not survive in option elements.
  const perspectiveChoices = identity.perspectives.filter(
    (item) =>
      perspective === 'DM' ||
      item.value === perspective ||
      ['DM', 'PARTY', 'PUBLIC'].includes(item.value) ||
      (identity.role === 'PLAYER' &&
        (item.value === 'PLAYER' ||
          item.value === `CHARACTER:${identity.character?.entityId ?? ''}`)),
  );
  const api = useMemo(
    () => new WorldApi(connection, perspective, effective),
    [connection, perspective, effective, revision],
  );
  // Only the DM, only in the perspective of the character the DM chose to act as.
  const actingAs =
    identity.role === 'DM' && standIn !== null && perspective === `CHARACTER:${standIn.characterId}`
      ? standIn
      : null;
  return (
    <div className="session-shell">
      <a className="skip-link" href="#world-main">
        {t('Skip to world')}
      </a>
      <TopBar
        campaignName={identity.campaign.name}
        status={status}
        perspective={perspective}
        choices={perspectiveChoices}
        dmView={effective === 'DM'}
        onPerspective={onPerspective}
        onRefresh={() => {
          setRevision((value) => value + 1);
        }}
        onLeave={onLeave}
        sessionSlot={setSessionSlot}
      />
      {actingAs && <ActingBar standIn={actingAs} onStop={onStopActing} />}
      <World
        key={`${perspective}:${String(revision)}`}
        api={api}
        effectivePerspective={effective}
        canAct={
          identity.role === 'PLAYER' &&
          effective === `CHARACTER:${identity.character?.entityId ?? ''}`
        }
        standIn={actingAs}
        onActAs={onActAs}
        sessionSlot={sessionSlot}
      />
    </div>
  );
}
