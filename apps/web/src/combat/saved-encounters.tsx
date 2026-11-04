import type {
  EntityRef,
  SavedEncounterBlock,
  SavedEncounterView,
  SavedEncountersResponse,
  StartedPreparedEncounterResponse,
} from '@ltw/contracts';
import { StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useCallback, useRef, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useLiveRefresh } from '../api/live-context.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import { difficultyText } from './difficulty-words.tsx';
import { EncounterBuilder } from './encounter-builder.tsx';
import { SurpriseChoice, type SurpriseValue } from './surprise-choice.tsx';

/**
 * The DM's own encounters in the Encounter sheet (docs/adr/0057-encounters-maps-loot.md §1): each
 * with its place, its foes, its difficulty for the party there now, started in one step by the
 * server, changed in the builder or deleted after a second word. A lost answer to a start is
 * retried under the same request, so nothing starts twice.
 */
const BLOCKED: Readonly<Record<SavedEncounterBlock, string>> = {
  'in-combat': 'A fight is already running.',
  'no-foes': 'One of its creatures cannot fight any more.',
  'no-party': 'Nobody of the party is at {place} yet.',
  gone: 'Its place or one of its creatures is no longer in the campaign: change it or delete it.',
};

/** "3 × Goblin, Bugbear": the foes gathered by name. */
function foesLine(t: ReturnType<typeof useT>, encounter: SavedEncounterView): string {
  const counts = new Map<string, number>();
  for (const foe of encounter.foes) counts.set(foe.name, (counts.get(foe.name) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => (count > 1 ? t('{count} × {name}', { count, name }) : name))
    .join(', ');
}

export function SavedEncounters({
  api,
  locationId,
  directory,
  locked,
  onStarted,
}: {
  readonly api: WorldApi;
  readonly locationId: string;
  readonly directory: readonly EntityRef[];
  readonly locked: boolean;
  readonly onStarted: () => void;
}) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<SavedEncountersResponse>('encounters/saved', signal, false),
    [api],
  );
  const { resource, retry, reread } = useResource('saved-encounters', load);
  useRereadOn(useLiveRefresh(), reread);
  // The builder's subject: a saved encounter to change, a new one, or none open.
  const [editing, setEditing] = useState<SavedEncounterView | 'new' | null>(null);
  const places = directory.filter((entity) => entity.kind === 'location');
  const creatures = directory.filter((entity) => entity.kind === 'creature');
  if (resource.status === 'loading') return null;
  if (resource.status === 'error')
    return <StatusPanel state="error" label={resource.message} onRetry={retry} />;
  return (
    <section className="saved-encounters" aria-labelledby="saved-encounters-title">
      <h4 id="saved-encounters-title">{t('Your encounters')}</h4>
      {resource.value.encounters.length === 0 && editing === null && (
        <p className="muted">
          {t('Build one from the bestiary: it waits here until you start it.')}
        </p>
      )}
      <ul className="prepared-list">
        {resource.value.encounters.map((encounter) => (
          <SavedRow
            key={encounter.encounterId}
            api={api}
            encounter={encounter}
            locked={locked}
            onStarted={() => {
              reread();
              onStarted();
            }}
            onChanged={reread}
            onEdit={() => {
              setEditing(encounter);
            }}
          />
        ))}
      </ul>
      {editing === null ? (
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            setEditing('new');
          }}
        >
          <Glyph name="encounter" />
          {t('Build an encounter')}
        </button>
      ) : (
        <EncounterBuilder
          key={editing === 'new' ? 'new' : editing.encounterId}
          api={api}
          encounter={editing === 'new' ? null : editing}
          locationId={locationId}
          places={places}
          creatures={creatures}
          onSaved={() => {
            setEditing(null);
            reread();
          }}
          onCancel={() => {
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function SavedRow({
  api,
  encounter,
  locked,
  onStarted,
  onChanged,
  onEdit,
}: {
  readonly api: WorldApi;
  readonly encounter: SavedEncounterView;
  readonly locked: boolean;
  readonly onStarted: () => void;
  readonly onChanged: () => void;
  readonly onEdit: () => void;
}) {
  const t = useT();
  const number = new Intl.NumberFormat(useLanguage());
  const [busy, setBusy] = useState(false);
  const [lost, setLost] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [surprised, setSurprised] = useState<SurpriseValue>('none');
  const request = useRef<string | null>(null);
  const path = `encounters/saved/${encodeURIComponent(encounter.encounterId)}`;
  const start = async () => {
    request.current ??= crypto.randomUUID();
    setBusy(true);
    setLost(false);
    try {
      await api.post<StartedPreparedEncounterResponse>(
        `${path}/start`,
        { requestId: request.current, ...(surprised === 'none' ? {} : { surprised }) },
        AbortSignal.timeout(30_000),
      );
      request.current = null;
      onStarted();
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) {
        request.current = null;
        onChanged();
      } else {
        setLost(true);
      }
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.post(`${path}/delete`, {}, AbortSignal.timeout(20_000));
    } finally {
      setBusy(false);
      setDeleting(false);
      onChanged();
    }
  };
  const names = encounter.party.map((character) => character.name).join(', ');
  return (
    <li className="prepared-row saved-row">
      <div className="prepared-head">
        <Glyph name="encounter" />
        <strong>{encounter.name}</strong>
        {encounter.location && <span className="muted">{encounter.location.name}</span>}
      </div>
      <p className="prepared-facts">{foesLine(t, encounter)}</p>
      {encounter.difficulty && (
        <p className={`encounter-difficulty is-${encounter.difficulty.rating}`}>
          {difficultyText(t, number, encounter.difficulty)}
        </p>
      )}
      {names !== '' && <p className="muted">{t('Joining: {names}', { names })}</p>}
      {encounter.blocked && (
        <p className="muted">
          {t(BLOCKED[encounter.blocked], { place: encounter.location?.name ?? '' })}
        </p>
      )}
      {lost && (
        <p className="authoring-notice error" role="alert">
          {t('The answer was lost on the way. Start again: it will not start twice.')}
        </p>
      )}
      {encounter.blocked === null && (
        <SurpriseChoice value={surprised} disabled={locked || busy} onChange={setSurprised} />
      )}
      <div className="action-row">
        <button
          className="primary-button"
          disabled={locked || busy || encounter.blocked !== null}
          aria-label={t('Start: {title}', { title: encounter.name })}
          onClick={() => void start()}
        >
          <Glyph name="encounter" />
          {busy ? t('Starting…') : t('Start')}
        </button>
        <button
          type="button"
          disabled={locked || busy}
          aria-label={t('Change: {title}', { title: encounter.name })}
          onClick={onEdit}
        >
          {t('Change')}
        </button>
        {deleting ? (
          <>
            <button type="button" disabled={busy} onClick={() => void remove()}>
              {t('Delete it')}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleting(false);
              }}
            >
              {t('Keep it')}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={locked || busy}
            aria-label={t('Delete: {title}', { title: encounter.name })}
            onClick={() => {
              setDeleting(true);
            }}
          >
            {t('Delete')}
          </button>
        )}
      </div>
    </li>
  );
}
