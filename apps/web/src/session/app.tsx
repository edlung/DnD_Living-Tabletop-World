import { campaignAppearance } from '../visual/campaign-themes/index.ts';
import type { SessionResponse } from '@ltw/contracts';
import { LanguageProvider, StatusPanel, useLanguage, useT, type Language } from '@ltw/ui';
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { WorldApi, credentialOptions, type Connection } from '../api/client.ts';
import { REPORT_NOTE } from '../report/broken-page.tsx';
import { reportError, reportPage, reportSender } from '../report/reporter.ts';
import { LiveActiveContext, LiveRefreshContext, LiveTargetContext } from '../api/live-context.ts';
import { useResource } from '../api/resource.ts';
import type { StandIn } from '../combat/stand-in.ts';
import { TopBar } from '../shell/top-bar.tsx';
import { ornamentUrl } from '../visual/ui-kit.ts';
import { RulesApiContext } from '../rules/reference-data.ts';
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

function BoundaryFallback({
  onLeave,
  reported,
}: {
  readonly onLeave: () => void;
  /** A note of what broke left for the server: said only when it did. */
  readonly reported: boolean;
}) {
  const t = useT();
  const again = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    again.current?.focus();
  }, []);
  return (
    <main className="connection-state session-broken">
      <Emblem />
      <StatusPanel
        state="error"
        label={t('Something went wrong on this screen. The game itself is safe.')}
      />
      {/* Loading again is what helps, and what a child can do; leaving stays beside it. */}
      <div className="action-row">
        <button
          ref={again}
          type="button"
          className="primary-button"
          onClick={() => {
            window.location.reload();
          }}
        >
          {t('Load the game again')}
        </button>
        <LeaveButton onLeave={onLeave} />
      </div>
      <p>{t('If that does not help, tell your DM.')}</p>
      {reported && <p className="muted">{t(REPORT_NOTE)}</p>}
    </main>
  );
}

/**
 * Last-resort boundary of a session's screens: no stale projection survives, and what broke is
 * reported (docs/adr/0073-table-ideas.md §1).
 */
class SessionBoundary extends Component<
  { children: ReactNode; onLeave: () => void; language: Language },
  { failed: boolean; reported: boolean }
> {
  override state = { failed: false, reported: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    this.setState({ reported: reportError('render', error) });
  }
  override render() {
    // The words are the campaign's language: its own provider went down with the screen.
    return this.state.failed ? (
      <LanguageProvider language={this.props.language}>
        <BoundaryFallback onLeave={this.props.onLeave} reported={this.state.reported} />
      </LanguageProvider>
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
  // Told while drawing, so a first render that fails is placed (docs/adr/0073-table-ideas.md §1).
  reportPage(screen.kind === 'hub' ? 'campaigns' : screen.kind === 'session' ? 'game' : 'sign-in');
  reportSender(
    screen.kind === 'session'
      ? {
          campaignId: screen.connection.campaignId,
          headers: credentialOptions(screen.connection).headers,
        }
      : null,
  );
  if (screen.kind === 'hub') {
    return (
      <LanguageProvider language={browser}>
        <DocumentLanguage />
        <HubPage
          onOpen={flow.openCampaign}
          onCreate={flow.createCampaign}
          onCreateLibrary={flow.createLibraryCampaign}
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
          <SessionBoundary
            key={screen.key}
            onLeave={flow.leave}
            language={campaignLanguage ?? browser}
          >
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
  // A player's own characters (ADR 0044 §6): each one's perspective, to look and act as.
  const own = new Set(identity.characters.map((character) => `CHARACTER:${character.entityId}`));
  // Names/IDs of other DM-only characters must not survive in option elements.
  const perspectiveChoices = identity.perspectives.filter(
    (item) =>
      perspective === 'DM' ||
      item.value === perspective ||
      ['DM', 'PARTY', 'PUBLIC'].includes(item.value) ||
      (identity.role === 'PLAYER' && (item.value === 'PLAYER' || own.has(item.value))),
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
    <div className="session-shell" {...campaignAppearance(identity.campaign.name)}>
      <a className="skip-link" href="#world-main">
        {t('Skip to world')}
      </a>
      {/* The API for the rules' pages, and for the guide's "Our table" in the top bar. */}
      <RulesApiContext.Provider value={api}>
        <TopBar
          campaignName={identity.campaign.name}
          status={status}
          perspective={perspective}
          choices={perspectiveChoices}
          dmView={effective === 'DM'}
          dm={identity.role === 'DM'}
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
          canAct={identity.role === 'PLAYER' && own.has(effective)}
          standIn={actingAs}
          onActAs={onActAs}
          sessionSlot={sessionSlot}
        />
      </RulesApiContext.Provider>
    </div>
  );
}
