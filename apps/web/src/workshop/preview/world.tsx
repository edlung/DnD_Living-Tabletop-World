import type {
  CampaignPreviewCatalog,
  CampaignPreviewView,
  EntityRef,
  Square,
} from '@ltw/contracts';
import { combatantLabels, LanguageProvider, StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useResource } from '../../api/resource.ts';
import { Board } from '../../combat/board/board.tsx';
import { useBoardView } from '../../combat/board/board-view.ts';
import { ApprovedImages, ApprovedImagesContext } from '../../visual/approved-images.ts';
import { Backdrop } from '../../world/backdrop.tsx';
import { unidentifiedName } from '../../world/entity-words.ts';
import { Scene } from '../../world/scene.tsx';
import type { WorkshopClient } from '../client.ts';
import { DraftPreviewApi } from './api.ts';
import { PreviewEntityPanel } from './entity-panel.tsx';
import { previewScopeKey, type PreviewCamera, type PreviewScope } from './scope.ts';

export function PreviewWorld({
  client,
  draftId,
  scope,
  encounters = [],
  onLeave,
  onScenario,
  initialEntityId,
  refresh = 0,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly scope: PreviewScope;
  readonly encounters?: CampaignPreviewCatalog['encounters'];
  readonly onLeave?: () => void;
  readonly onScenario?: (entityId: string) => void;
  readonly initialEntityId?: string;
  readonly refresh?: number;
}) {
  const t = useT();
  const scopeKey = previewScopeKey(scope);
  const api = useMemo(
    () => new DraftPreviewApi(client, draftId, scope),
    [client, draftId, scopeKey],
  );
  const [camera, setCamera] = useState<PreviewCamera>({});
  const [selected, setSelected] = useState<string | null>(initialEntityId ?? null);
  const load = useCallback((signal: AbortSignal) => api.view(camera, signal), [api, camera]);
  const cameraKey = `${camera.locationId ?? ''}:${camera.encounterId ?? ''}`;
  const { resource, retry } = useResource(
    `preview:${previewScopeKey(scope)}:${cameraKey}:${String(refresh)}`,
    load,
  );
  if (resource.status !== 'ready')
    return (
      <section className="workshop-preview-loading">
        {onLeave && <button onClick={onLeave}>{t('Return to owner preview')}</button>}
        <StatusPanel
          state={resource.status}
          label={
            resource.status === 'error'
              ? t('The world preview could not be read. Check the saved scenario.')
              : t('Preparing a view of the world…')
          }
          onRetry={retry}
        />
      </section>
    );
  return (
    <LanguageProvider language={resource.value.language}>
      <PreviewImages key={`${previewScopeKey(scope)}:${resource.value.manifestDigest}`} api={api}>
        <PreviewContent
          view={resource.value}
          api={api}
          scope={scope}
          encounters={encounters}
          camera={camera}
          onCamera={(next) => {
            setCamera(next);
            setSelected(null);
          }}
          selected={selected}
          onSelect={setSelected}
          onRetry={retry}
          {...(onLeave ? { onLeave } : {})}
          {...(onScenario ? { onScenario } : {})}
        />
      </PreviewImages>
    </LanguageProvider>
  );
}

function PreviewImages({
  api,
  children,
}: {
  readonly api: DraftPreviewApi;
  readonly children: React.ReactNode;
}) {
  const images = useMemo(() => new ApprovedImages(api), [api]);
  useEffect(
    () => () => {
      images.release();
    },
    [images],
  );
  return <ApprovedImagesContext.Provider value={images}>{children}</ApprovedImagesContext.Provider>;
}

function PreviewContent({
  view,
  api,
  scope,
  encounters,
  camera,
  onCamera,
  selected,
  onSelect,
  onRetry,
  onLeave,
  onScenario,
}: {
  readonly view: CampaignPreviewView;
  readonly api: DraftPreviewApi;
  readonly scope: PreviewScope;
  readonly encounters: CampaignPreviewCatalog['encounters'];
  readonly camera: PreviewCamera;
  readonly onCamera: (camera: PreviewCamera) => void;
  readonly selected: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly onRetry: () => void;
  readonly onLeave?: () => void;
  readonly onScenario?: (entityId: string) => void;
}) {
  const t = useT();
  const language = useLanguage();
  const boardView = useBoardView();
  const [square, setSquare] = useState<Square | null>(null);
  useEffect(() => {
    const oldTitle = document.title;
    const oldLanguage = document.documentElement.lang;
    document.title = t('{name} · World preview', { name: view.campaignName });
    document.documentElement.lang = language;
    return () => {
      document.title = oldTitle;
      document.documentElement.lang = oldLanguage;
    };
  }, [language, view.campaignName]);
  const directory: EntityRef[] = view.directory.flatMap((entry) =>
    entry.name === null ? [] : [{ ...entry, name: entry.name }],
  );
  const scene = view.scene;
  const locationRef = view.locations.find((entry) => entry.entityId === scene?.location.entityId);
  const location: EntityRef | null = scene
    ? {
        entityId: scene.location.entityId,
        kind: 'location',
        name: locationRef?.name ?? t('Unidentified location'),
      }
    : null;
  const prepared = 'prepared' in view ? view.prepared : null;
  const labels = prepared
    ? combatantLabels({ order: [], combatants: prepared.layout.combatants }, t)
    : new Map<string, string>();
  const visible = (id: string) => scene?.present.find((entity) => entity.entityId === id);
  return (
    <section className="workshop-preview" aria-label={t('World preview')}>
      {onLeave && <button onClick={onLeave}>{t('Return to owner preview')}</button>}
      <header className="workshop-preview-heading">
        {view.perspective.kind === 'CHARACTER' ? (
          <h1>{view.campaignName}</h1>
        ) : (
          <h2>{view.campaignName}</h2>
        )}
        <p>
          {view.perspective.kind === 'CHARACTER'
            ? t('Initial view of {name}', { name: view.perspective.character.name })
            : t('Owner view of the prepared world')}
        </p>
        <p>{t('Saved revision {revision}', { revision: view.revision })}</p>
      </header>
      <p>{t('Preview only. Looking around does not move anyone or record played events.')}</p>
      <div className="workshop-preview-controls">
        <div>
          <label htmlFor="workshop-preview-location">{t('View a location')}</label>
          <select
            id="workshop-preview-location"
            value={camera.locationId ?? scene?.location.entityId ?? ''}
            onChange={(event) => {
              onCamera({ locationId: event.target.value });
            }}
          >
            {!view.locations.length && <option value="">{t('No known locations')}</option>}
            {view.locations.map((entry) => (
              <option key={entry.entityId} value={entry.entityId}>
                {entry.name ?? unidentifiedName(t, entry.kind)}
              </option>
            ))}
          </select>
        </div>
        {scope.perspective === 'OWNER' && encounters.length > 0 && (
          <div>
            <label htmlFor="workshop-preview-encounter">{t('Prepared encounter layout')}</label>
            <select
              id="workshop-preview-encounter"
              value={camera.encounterId ?? ''}
              onChange={(event) => {
                onCamera(event.target.value ? { encounterId: event.target.value } : {});
              }}
            >
              <option value="">{t('Show the initial scene')}</option>
              {encounters.map((entry) => (
                <option key={entry.encounterId} value={entry.encounterId}>
                  {entry.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="workshop-preview-layout">
        <div className={`workshop-preview-stage${prepared ? ' has-prepared-board' : ''}`}>
          <Backdrop
            image={scene?.location.image ?? null}
            settled={scene !== null}
            missingImageNote={t('No chosen image in this view')}
          />
          {location && scene ? (
            <Scene
              location={location}
              scene={{ status: 'ready', value: scene }}
              onRetry={onRetry}
              directory={directory}
              nearby={[]}
              selectedId={selected}
              onSelect={(id) => {
                onSelect(id);
              }}
              battlefield={prepared !== null}
              rail={null}
              conversation={null}
              missingImageNote={t('No chosen image in this view')}
            />
          ) : (
            <p className="workshop-preview-empty">
              {t('There is no observed scene in this view.')}
            </p>
          )}
          {prepared && (
            <div className="workshop-preview-board">
              <h3>{prepared.title}</h3>
              <p>{t('Prepared positions only. No encounter has started.')}</p>
              <Board
                encounter={prepared.layout}
                labelOf={(id) => labels.get(id) ?? t('Unidentified creature')}
                selfId={null}
                selected={square}
                path={[]}
                affected={new Set()}
                imageOf={(id) => visible(id)?.image ?? null}
                figureOf={(id) => visible(id)?.figure ?? null}
                battleMap={scene?.location.battleMap ?? null}
                view={boardView}
                onPick={(position) => {
                  setSquare(position);
                  const occupant = prepared.layout.combatants.find(
                    (entry) => entry.position.x === position.x && entry.position.y === position.y,
                  );
                  onSelect(occupant?.entity.entityId ?? null);
                }}
              />
            </div>
          )}
        </div>
        {selected ? (
          <PreviewEntityPanel
            key={selected}
            api={api}
            scope={scope}
            entityId={selected}
            references={view.directory}
            onClose={() => {
              onSelect(null);
            }}
            {...(onScenario && scope.perspective === 'OWNER' ? { onScenario } : {})}
          />
        ) : (
          <aside className="workshop-panel workshop-preview-details">
            <p>{t('Choose a visible object to inspect it.')}</p>
            {view.perspective.kind === 'CHARACTER' && (
              <button
                onClick={() => {
                  onSelect(
                    view.perspective.kind === 'CHARACTER'
                      ? view.perspective.character.entityId
                      : null,
                  );
                }}
              >
                {t('Inspect your prepared character')}
              </button>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
