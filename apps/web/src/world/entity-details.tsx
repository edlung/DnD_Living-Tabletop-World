import type {
  CharacterSheetResponse,
  EntityContextResponse,
  EntityKnowledgeResponse,
  EntityRef,
  KnowledgeView,
} from '@ltw/contracts';
import { CharacterSheetDetails, KnowledgeDetails, StatusPanel, useT } from '@ltw/ui';
import { useCallback, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { PerformNpc } from '../dm/perform-npc.tsx';
import { ContextActions } from '../exploration/context-actions.tsx';
import type { ExplorationIntent } from '../exploration/use-action.ts';

export function EntityDetails({
  api,
  entityId,
  name,
  kind,
  known,
  effectivePerspective,
  directory,
  knowledge,
  canAct,
  locked,
  onRun,
  onSelect,
  onClose,
}: {
  readonly api: WorldApi;
  readonly entityId: string;
  readonly name: string | null;
  readonly kind: string;
  readonly known: boolean;
  readonly effectivePerspective: string;
  readonly directory: readonly EntityRef[];
  readonly knowledge: readonly KnowledgeView[];
  readonly canAct: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onSelect: (entityId: string, kind: string) => void;
  readonly onClose: () => void;
}) {
  const t = useT();
  const acting = effectivePerspective.startsWith('CHARACTER:');
  const [sheetOpen, setSheetOpen] = useState(false);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const path = `entities/${encodeURIComponent(entityId)}`;
      const [knowledge, context] = await Promise.all([
        known
          ? api.get<EntityKnowledgeResponse>(`${path}/knowledge`, signal)
          : Promise.resolve(null),
        acting ? api.get<EntityContextResponse>(`${path}/context`, signal) : Promise.resolve(null),
      ]);
      return { knowledge, context };
    },
    [api, entityId, acting, known],
  );
  const { resource, retry } = useResource(entityId, load);
  const canReadSheet =
    (effectivePerspective === 'DM' && ['character', 'npc', 'creature'].includes(kind)) ||
    (kind === 'character' && effectivePerspective === `CHARACTER:${entityId}`);
  return (
    <>
      <div className="section-heading">
        <p className="eyebrow">{t('A closer look')}</p>
        <button aria-label={t('Close details')} onClick={onClose}>
          ×
        </button>
      </div>
      <h2>{name ?? t('Unidentified {kind}', { kind: t(kind) })}</h2>
      <p className="entity-kind">{t(kind)}</p>
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={resource.status === 'error' ? resource.message : t('Loading entity details…')}
          onRetry={retry}
        />
      ) : (
        <>
          {resource.value.context && (
            <>
              <p className="presence-label">
                {resource.value.context.context.visibleState.present
                  ? t('Present in your surroundings')
                  : t('Known, but not here')}
              </p>
              {resource.value.context.context.visibleState.hitPoints && (
                <p>
                  {t('Hit points: {current} / {max}', {
                    current: resource.value.context.context.visibleState.hitPoints.current,
                    max: resource.value.context.context.visibleState.hitPoints.max,
                  })}
                </p>
              )}
              {resource.value.context.context.visibleState.distanceFt !== undefined && (
                <p>
                  {t('Distance: {feet} ft', {
                    feet: resource.value.context.context.visibleState.distanceFt,
                  })}
                </p>
              )}
              <ContextActions
                api={api}
                context={resource.value.context}
                directory={directory}
                knowledge={knowledge}
                canAct={canAct}
                locked={locked}
                onRun={onRun}
              />
            </>
          )}
          {resource.value.knowledge && (
            <section className="related-leads" aria-label={t('Related leads')}>
              <h3>{t('Follow a lead')}</h3>
              {resource.value.knowledge.relatedEntities
                .filter((entity) => entity.entityId !== entityId)
                .map((entity) => (
                  <button
                    key={entity.entityId}
                    onClick={() => {
                      onSelect(entity.entityId, entity.kind);
                    }}
                  >
                    {t('Explore {place}', { place: entity.name })}
                  </button>
                ))}
              {resource.value.knowledge.knowledge
                .filter((record) => record.knowledgeType === 'CONTRADICTION')
                .map((record) => (
                  <div className="contradiction-highlight" key={record.knowledgeId}>
                    <span className="badge badge--contradiction">{t('CONTRADICTION')}</span>
                    <p>{record.statement}</p>
                  </div>
                ))}
            </section>
          )}
          {effectivePerspective === 'DM' && kind === 'npc' && (
            <PerformNpc
              api={api}
              npcId={entityId}
              npcName={name ?? entityId}
              directory={directory}
            />
          )}
          <details className="disclosure">
            <summary>{t('Full knowledge')}</summary>
            <KnowledgeDetails knowledge={resource.value.knowledge?.knowledge ?? []} />
          </details>
          {canReadSheet && (
            <div className="sheet-access">
              <button
                className="primary-button"
                aria-expanded={sheetOpen}
                onClick={() => {
                  setSheetOpen((open) => !open);
                }}
              >
                {t('Full character sheet')}
              </button>
              {sheetOpen && <Sheet api={api} entityId={entityId} />}
            </div>
          )}
        </>
      )}
    </>
  );
}

function Sheet({ api, entityId }: { readonly api: WorldApi; readonly entityId: string }) {
  const t = useT();

  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<CharacterSheetResponse>(`entities/${encodeURIComponent(entityId)}/sheet`, signal),
    [api, entityId],
  );
  const { resource, retry } = useResource(entityId, load);
  return resource.status === 'ready' ? (
    <CharacterSheetDetails name={resource.value.entity.name} sheet={resource.value.sheet} />
  ) : (
    <StatusPanel
      state={resource.status}
      label={
        resource.status === 'error' ? resource.message : t('Loading the full character sheet…')
      }
      onRetry={retry}
    />
  );
}
