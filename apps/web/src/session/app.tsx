import type { SessionResponse } from '@ltw/contracts';
import { LanguageProvider, StatusPanel, useT, type Language } from '@ltw/ui';
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
import { useResource } from '../api/resource.ts';
import { World } from '../world/world.tsx';
import { Login } from './login.tsx';

function BoundaryFallback({ onLeave }: { readonly onLeave: () => void }) {
  const t = useT();
  return (
    <main className="connection-state">
      <StatusPanel
        state="error"
        label={t('This world response could not be displayed. Reconnect to try again.')}
      />
      <button onClick={onLeave}>{t('Leave session')}</button>
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

export function App() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const leave = useCallback(() => {
    setConnection(null);
  }, []);
  // bfcache must not resurrect a privileged view on Back/Forward restoration.
  useEffect(() => {
    const clear = () => {
      setConnection(null);
    };
    window.addEventListener('pagehide', clear);
    window.addEventListener('pageshow', clear);
    return () => {
      window.removeEventListener('pagehide', clear);
      window.removeEventListener('pageshow', clear);
    };
  }, []);
  // Before a session names the campaign's language, the browser's language speaks.
  return (
    <LanguageProvider language={browserLanguage()}>
      {connection ? (
        <SessionBoundary onLeave={leave}>
          <SessionGate connection={connection} onLeave={leave} />
        </SessionBoundary>
      ) : (
        <Login onConnect={setConnection} />
      )}
    </LanguageProvider>
  );
}

function SessionGate({
  connection,
  onLeave,
}: {
  readonly connection: Connection;
  readonly onLeave: () => void;
}) {
  const t = useT();
  const api = useMemo(() => new WorldApi(connection, ''), [connection]);
  const load = useCallback(
    (signal: AbortSignal) => api.get<SessionResponse>('session', signal, false),
    [api],
  );
  const { resource, retry } = useResource('identity', load);
  if (resource.status !== 'ready')
    return (
      <main className="connection-state">
        <p className="wordmark">{t('◈ Living Tabletop World')}</p>
        <StatusPanel
          state={resource.status}
          label={resource.status === 'error' ? resource.message : t('Opening your session…')}
          onRetry={retry}
        />
        <button onClick={onLeave}>{t('Leave session')}</button>
      </main>
    );
  // From here on the campaign's own language speaks, whatever the browser's is.
  return (
    <LanguageProvider language={resource.value.campaign.language}>
      <SessionWorld connection={connection} identity={resource.value} onLeave={onLeave} />
    </LanguageProvider>
  );
}

function SessionWorld({
  connection,
  identity,
  onLeave,
}: {
  readonly connection: Connection;
  readonly identity: SessionResponse;
  readonly onLeave: () => void;
}) {
  const t = useT();
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const [perspective, setPerspective] = useState(identity.perspectives[0]?.value ?? 'PUBLIC');
  const [revision, setRevision] = useState(0);
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
  return (
    <>
      <a className="skip-link" href="#world-main">
        {t('Skip to world')}
      </a>
      <header className="app-header">
        <div className="wordmark">
          <span aria-hidden="true">◈</span> {t('Living Tabletop World')}
        </div>
        <div className="session-controls">
          <label htmlFor="perspective">{t('Perspective')}</label>
          <select
            id="perspective"
            value={perspective}
            onChange={(event) => {
              setPerspective(event.target.value);
            }}
          >
            {perspectiveChoices.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setRevision((value) => value + 1);
            }}
          >
            {t('Refresh world')}
          </button>
          <button className="quiet-button" onClick={onLeave}>
            {t('Leave session')}
          </button>
        </div>
      </header>
      <World
        key={`${perspective}:${revision}`}
        api={api}
        campaignName={identity.campaign.name}
        effectivePerspective={effective}
        canAct={
          identity.role === 'PLAYER' &&
          effective === `CHARACTER:${identity.character?.entityId ?? ''}`
        }
      />
    </>
  );
}
