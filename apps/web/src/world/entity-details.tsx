import type {
  CharacterSheetResponse,
  EntityContextResponse,
  EntityKnowledgeResponse,
  EntityRef,
  KnowledgeView,
} from '@ltw/contracts';
import { CharacterSheetDetails, KnowledgeDetails, StatusPanel } from '@ltw/ui';
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
        <p className="eyebrow">A closer look</p>
        <button aria-label="Close details" onClick={onClose}>
          ×
        </button>
      </div>
      <h2>{name ?? `Unidentified ${kind}`}</h2>
      <p className="entity-kind">{kind}</p>
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={resource.status === 'error' ? resource.message : 'Loading entity details…'}
          onRetry={retry}
        />
      ) : (
        <>
          {resource.value.context && (
            <>
              <p className="presence-label">
                {resource.value.context.context.visibleState.present
                  ? 'Present in your surroundings'
                  : 'Known, but not here'}
              </p>
              {resource.value.context.context.visibleState.hitPoints && (
                <p>
                  Hit points: {resource.value.context.context.visibleState.hitPoints.current} /{' '}
                  {resource.value.context.context.visibleState.hitPoints.max}
                </p>
              )}
              {resource.value.context.context.visibleState.distanceFt !== undefined && (
                <p>Distance: {resource.value.context.context.visibleState.distanceFt} ft</p>
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
            <section className="related-leads" aria-label="Related leads">
              <h3>Follow a lead</h3>
              {resource.value.knowledge.relatedEntities
                .filter((entity) => entity.entityId !== entityId)
                .map((entity) => (
                  <button
                    key={entity.entityId}
                    onClick={() => {
                      onSelect(entity.entityId, entity.kind);
                    }}
                  >
                    Explore {entity.name}
                  </button>
                ))}
              {resource.value.knowledge.knowledge
                .filter((record) => record.knowledgeType === 'CONTRADICTION')
                .map((record) => (
                  <div className="contradiction-highlight" key={record.knowledgeId}>
                    <span className="badge badge--contradiction">CONTRADICTION</span>
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
            <summary>Full knowledge</summary>
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
                Full character sheet
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
      label={resource.status === 'error' ? resource.message : 'Loading the full character sheet…'}
      onRetry={retry}
    />
  );
}
