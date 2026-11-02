import type {
  PreparedEncounterBlock,
  PreparedEncounterListResponse,
  PreparedEncounterView,
  StartedPreparedEncounterResponse,
} from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useRef, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useLiveRefresh } from '../api/live-context.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import { SurpriseChoice, type SurpriseValue } from './surprise-choice.tsx';

/**
 * The adventure's prepared encounters, in the DM's Encounter sheet (Stage 605): each with its
 * place, its foes and who of the party is there, started in one step by the server — the foes are
 * placed, then the fight begins (docs/adr/0015-combat-engine.md, 2026-11-02). A lost answer is
 * retried under the same request, so nothing starts twice.
 */
const BLOCKED: Readonly<Record<PreparedEncounterBlock, string>> = {
  'in-combat': 'A fight is already running.',
  'no-foes': 'None of its foes can fight any more.',
  'no-party': 'Nobody of the party is at {place} yet.',
};

export function PreparedEncounters({
  api,
  locked,
  onStarted,
}: {
  readonly api: WorldApi;
  readonly locked: boolean;
  readonly onStarted: () => void;
}) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<PreparedEncounterListResponse>('encounters/prepared', signal, false),
    [api],
  );
  const { resource, retry, reread } = useResource('prepared-encounters', load);
  useRereadOn(useLiveRefresh(), reread);
  if (resource.status === 'loading') return null;
  if (resource.status === 'error') {
    return <StatusPanel state="error" label={resource.message} onRetry={retry} />;
  }
  if (resource.value.encounters.length === 0) return null;
  return (
    <section className="prepared-encounters" aria-labelledby="prepared-title">
      <h4 id="prepared-title">{t('Prepared encounters')}</h4>
      <ul className="prepared-list">
        {resource.value.encounters.map((encounter) => (
          <PreparedRow
            key={encounter.encounterId}
            api={api}
            encounter={encounter}
            locked={locked}
            onStarted={() => {
              reread();
              onStarted();
            }}
            onRefused={reread}
          />
        ))}
      </ul>
    </section>
  );
}

function PreparedRow({
  api,
  encounter,
  locked,
  onStarted,
  onRefused,
}: {
  readonly api: WorldApi;
  readonly encounter: PreparedEncounterView;
  readonly locked: boolean;
  readonly onStarted: () => void;
  readonly onRefused: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [lost, setLost] = useState(false);
  const [surprised, setSurprised] = useState<SurpriseValue>('none');
  // The request a lost answer is retried under: the server starts nothing twice for it.
  const request = useRef<string | null>(null);
  const start = async () => {
    request.current ??= crypto.randomUUID();
    setBusy(true);
    setLost(false);
    try {
      await api.post<StartedPreparedEncounterResponse>(
        `encounters/prepared/${encodeURIComponent(encounter.encounterId)}/start`,
        {
          requestId: request.current,
          ...(surprised === 'none' ? {} : { surprised }),
        },
        AbortSignal.timeout(30_000),
      );
      request.current = null;
      onStarted();
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) {
        // The server said no (a fight began meanwhile, the party left): read what holds now.
        request.current = null;
        onRefused();
      } else {
        setLost(true);
      }
    } finally {
      setBusy(false);
    }
  };
  const names = encounter.party.map((character) => character.name).join(', ');
  return (
    <li className="prepared-row">
      <div className="prepared-head">
        <Glyph name="encounter" />
        <strong>{encounter.title}</strong>
        <span className="muted">{encounter.location.name}</span>
      </div>
      <p className="muted">{encounter.summary}</p>
      <p className="prepared-facts">
        {t('Foes: {count}', { count: encounter.foes })}
        {names !== '' && <> · {t('Joining: {names}', { names })}</>}
      </p>
      {encounter.blocked && (
        <p className="muted">{t(BLOCKED[encounter.blocked], { place: encounter.location.name })}</p>
      )}
      {lost && (
        <p className="authoring-notice error" role="alert">
          {t('The answer was lost on the way. Start again: it will not start twice.')}
        </p>
      )}
      {encounter.blocked === null && (
        <SurpriseChoice value={surprised} disabled={locked || busy} onChange={setSurprised} />
      )}
      <button
        className="primary-button"
        disabled={locked || busy || encounter.blocked !== null}
        aria-label={t('Start: {title}', { title: encounter.title })}
        onClick={() => void start()}
      >
        <Glyph name="encounter" />
        {busy ? t('Starting…') : t('Start')}
      </button>
    </li>
  );
}
