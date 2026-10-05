import type {
  EncounterResponse,
  EntityRef,
  KnowledgeListResponse,
  KnownEntitiesResponse,
  PlayerOutcome,
  SessionListResponse,
  SurroundingsResponse,
} from '@ltw/contracts';
import { EncounterSummary, KnowledgeDetails, StatusPanel } from '@ltw/ui';
import { useCallback, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { AuthoringPanel } from '../authoring/authoring-panel.tsx';
import { ChroniclePanel } from '../chronicle/chronicle-panel.tsx';
import { DmWorldControls } from '../dm/world-controls.tsx';
import { CombatPanel } from '../combat/combat-panel.tsx';
import { DmCombatControls } from '../combat/dm-controls.tsx';
import { ActionNotice } from '../exploration/action-notice.tsx';
import { useAction } from '../exploration/use-action.ts';
import { EntityDetails } from './entity-details.tsx';
import { RecentEvents } from './recent-events.tsx';
import { Scene } from './scene.tsx';

interface Selected {
  readonly entityId: string;
  readonly kind: string;
}

export function World({
  api,
  campaignName,
  effectivePerspective,
  canAct,
}: {
  readonly api: WorldApi;
  readonly campaignName: string;
  readonly effectivePerspective: string;
  readonly canAct: boolean;
}) {
  const [revision, setRevision] = useState(0);
  // Kept here so the panel stays open across the refresh each command causes.
  const [dmToolsOpen, setDmToolsOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const acting = effectivePerspective.startsWith('CHARACTER:');
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [directory, encounter, sessions, knowledge, surroundings] = await Promise.all([
        api.get<KnownEntitiesResponse>('entities', signal),
        api.get<EncounterResponse>('encounter', signal),
        api.get<SessionListResponse>('sessions', signal, false),
        api.get<KnowledgeListResponse>('knowledge', signal),
        acting ? api.get<SurroundingsResponse>('surroundings', signal) : Promise.resolve(null),
      ]);
      return { directory, encounter, sessions, knowledge, surroundings };
    },
    [api, acting],
  );
  const { resource, retry } = useResource(`world:${revision}`, load);
  const onResolved = useCallback((outcome?: PlayerOutcome) => {
    if (outcome?.kind === 'EnterLocation') {
      // Arrival keeps the place itself as the object in context, so it can be examined.
      setViewing(outcome.locationId);
      setSelected({ entityId: outcome.locationId, kind: 'location' });
    }
    setRevision((value) => value + 1);
  }, []);
  // Players act as their character; the DM alone runs the existing encounter operations.
  const action = useAction(api, canAct || effectivePerspective === 'DM', onResolved);
  const choose = (entityId: string, kind: string) => {
    setSelected({ entityId, kind });
  };
  const data = resource.status === 'ready' ? resource.value : null;
  // The authoring session outlives each refresh, so it keeps the last directory meanwhile.
  const knownDirectory = useRef<readonly EntityRef[]>([]);
  if (data) knownDirectory.current = data.directory.entities;
  const locations = data?.directory.entities.filter((entity) => entity.kind === 'location') ?? [];
  const current = data?.surroundings?.location;
  const placeId =
    viewing ??
    current?.entityId ??
    locations.find((place) => place.entityId === 'market-square')?.entityId ??
    locations[0]?.entityId ??
    '';
  const knownPlace = locations.find((place) => place.entityId === placeId);
  const location =
    knownPlace ??
    (current?.entityId === placeId
      ? { ...current, name: current.name ?? 'Unidentified location' }
      : null);
  const selectedKnown = data?.directory.entities.find(
    (entity) => entity.entityId === selected?.entityId,
  );
  const openSession = data?.sessions.sessions.find((session) => session.endedAt === null);
  const discovered = revealedIds(action.notice?.outcome);
  return (
    <main id="world-main" className="world-main" tabIndex={-1}>
      <div className="world-heading">
        <div>
          <p className="eyebrow">Your shared world</p>
          <h1>{campaignName}</h1>
        </div>
        <span className={`perspective-badge ${effectivePerspective === 'DM' ? 'dm-badge' : ''}`}>
          {effectivePerspective === 'DM' ? 'DM view · all knowledge' : 'Scoped perspective'}
        </span>
      </div>
      <ActionNotice notice={action.notice} status={action.status} onRetry={action.retry} />
      {effectivePerspective === 'DM' && (
        <AuthoringPanel
          api={api}
          directory={data?.directory.entities ?? knownDirectory.current}
          onWorldChanged={() => {
            setRevision((value) => value + 1);
          }}
        />
      )}
      {!data ? (
        <StatusPanel
          state={resource.status === 'error' ? 'error' : 'loading'}
          label={
            resource.status === 'error' ? resource.message : 'Gathering your view of the world…'
          }
          onRetry={retry}
        />
      ) : (
        <>
          {discovered.length > 0 && (
            <section className="discovered-knowledge" aria-label="New knowledge">
              <KnowledgeDetails
                knowledge={data.knowledge.knowledge.filter((record) =>
                  discovered.includes(record.knowledgeId),
                )}
              />
            </section>
          )}
          <div className="world-toolbar">
            <div className="location-control">
              <label htmlFor="location">Location</label>
              <select
                id="location"
                value={placeId}
                disabled={locations.length === 0 && !location}
                onChange={(event) => {
                  setViewing(event.target.value);
                  setSelected(null);
                }}
              >
                {!location && locations.length === 0 && (
                  <option value="">No known locations</option>
                )}
                {location && !knownPlace && (
                  <option value={location.entityId}>{location.name}</option>
                )}
                {locations.map((place) => (
                  <option key={place.entityId} value={place.entityId}>
                    {place.name}
                  </option>
                ))}
              </select>
            </div>
            <span className="session-caption">{openSession?.title ?? 'No open play session'}</span>
          </div>
          {effectivePerspective === 'DM' && (
            <DmCombatControls
              key={`dm:${String(revision)}`}
              api={api}
              encounter={data.encounter.encounter}
              locationId={placeId}
              directory={data.directory.entities}
              locked={action.locked}
              onRun={action.run}
            />
          )}
          {effectivePerspective === 'DM' && (
            <DmWorldControls
              locationId={placeId}
              locationName={location?.name ?? 'this place'}
              locked={action.locked}
              open={dmToolsOpen}
              onToggle={setDmToolsOpen}
              onRun={action.run}
            />
          )}
          {data.encounter.encounter && (
            <CombatPanel
              key={`combat:${String(revision)}`}
              api={api}
              encounter={data.encounter.encounter}
              actorId={data.surroundings?.actingCharacterId ?? null}
              canAct={canAct}
              locked={action.locked}
              onRun={action.run}
            />
          )}
          <div className="world-grid">
            <section aria-label="Scene" className="scene-panel">
              {location ? (
                <Scene
                  key={`${placeId}:${revision}`}
                  api={api}
                  location={location}
                  directory={data.directory.entities}
                  selectedId={selected?.entityId ?? null}
                  onSelect={choose}
                />
              ) : (
                <StatusPanel
                  state="empty"
                  label="There are no known locations in this perspective yet."
                />
              )}
              {data.surroundings && data.surroundings.nearby.length > 0 && (
                <section className="nearby-places" aria-label="Nearby places">
                  <h3>Beyond this place</h3>
                  {data.surroundings.nearby.map((place) => (
                    <button
                      key={place.entityId}
                      onClick={() => {
                        choose(place.entityId, place.kind);
                      }}
                    >
                      Explore {place.name ?? 'Unidentified location'}
                    </button>
                  ))}
                </section>
              )}
              <details className="known-directory">
                <summary>Known destinations</summary>
                <div className="directory-list">
                  {locations.map((place) => (
                    <button
                      key={place.entityId}
                      onClick={() => {
                        choose(place.entityId, place.kind);
                      }}
                    >
                      Explore {place.name}
                    </button>
                  ))}
                </div>
              </details>
              <details className="known-directory">
                <summary>Known people &amp; places</summary>
                <p className="muted">
                  What this perspective knows. Presence is shown separately in the scene.
                </p>
                <div className="directory-list">
                  {data.directory.entities.map((entity) => (
                    <button
                      key={entity.entityId}
                      aria-pressed={selected?.entityId === entity.entityId}
                      onClick={() => {
                        choose(entity.entityId, entity.kind);
                      }}
                    >
                      {entity.name}
                      <span>{entity.kind}</span>
                    </button>
                  ))}
                </div>
                {data.directory.entities.length === 0 && <p>No entities are known yet.</p>}
              </details>
            </section>
            <aside aria-label="Entity details" className="detail-panel">
              {selected ? (
                <EntityDetails
                  key={`${selected.entityId}:${revision}`}
                  api={api}
                  entityId={selected.entityId}
                  name={selectedKnown?.name ?? null}
                  kind={selected.kind}
                  known={selectedKnown !== undefined}
                  effectivePerspective={effectivePerspective}
                  directory={data.directory.entities}
                  knowledge={data.knowledge.knowledge}
                  canAct={canAct && data.encounter.encounter === null}
                  locked={action.locked}
                  onRun={action.run}
                  onSelect={choose}
                  onClose={() => {
                    setSelected(null);
                  }}
                />
              ) : (
                <div className="selection-empty">
                  <span className="selection-mark" aria-hidden="true">
                    ◇
                  </span>
                  <p className="eyebrow">A closer look</p>
                  <h2>
                    The details are
                    <br />
                    in the world.
                  </h2>
                  <p>Select a person, place, or object to see what this perspective knows.</p>
                </div>
              )}
            </aside>
          </div>
          <div className="world-footer-grid">
            <EncounterSummary encounter={data.encounter.encounter} />
            <RecentEvents key={revision} api={api} />
          </div>
          <ChroniclePanel
            key={`chronicle:${String(revision)}`}
            api={api}
            isDm={effectivePerspective === 'DM'}
            characters={data.directory.entities.filter((entity) => entity.kind === 'character')}
          />
        </>
      )}
    </main>
  );
}

function revealedIds(outcome: PlayerOutcome | undefined): readonly string[] {
  switch (outcome?.kind) {
    case 'AskAbout':
      return outcome.shared;
    case 'ExamineEntity':
    case 'CastSpell':
      return outcome.discovered;
    case 'InsightCheck':
      return outcome.inferred;
    case 'FormHypothesis':
      return [outcome.knowledgeId];
    default:
      return [];
  }
}
