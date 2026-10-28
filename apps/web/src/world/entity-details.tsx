import type {
  CharacterSheetResponse,
  EntityContextResponse,
  EntityKind,
  EntityKnowledgeResponse,
  EntityRef,
  KnowledgeView,
} from '@ltw/contracts';
import { CharacterSheetDetails, StatusPanel, useT } from '@ltw/ui';
import { useCallback, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { NpcProfile, type ProfileEditing } from '../authoring/npc-profile.tsx';
import { PerformNpc } from '../dm/perform-npc.tsx';
import { ContextActions } from '../exploration/context-actions.tsx';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { EntityImages } from '../images/entity-images.tsx';
import { useHeldImage } from '../visual/approved-images.ts';
import { Glyph } from '../visual/glyph.tsx';
import { isFigure } from '../visual/glyph-map.ts';
import { IconButton } from '../visual/icon-button.tsx';
import { KnowledgeBadge, KnowledgeCards } from '../visual/knowledge-cards.tsx';
import { Medallion } from '../visual/medallion.tsx';
import { usePortrait } from './use-portrait.ts';
import { useRereadOn } from './use-world-data.ts';
import { distinctNames, unidentifiedName } from './entity-words.ts';

/**
 * The selection's panel (docs/STAGE_320_DESIGN.md §5.4): a portrait header (the approved image
 * or the neutral silhouette or mist; the name, or "Unidentified …", and the kind) — a thing or a
 * place with an approved image shows it as a plate (docs/STAGE_330_DESIGN.md: investigation
 * objects show their approved images in details) — the actions the server lists with their
 * glyphs, what this perspective knows as typed records, and the full sheet on demand. The DM
 * perspective shows what its projection supplies, "Perform", and the entity's images with the
 * DM's controls, and an NPC's name and description with their edit (owner decisions 11, SI-D8).
 * The last selection's panel stays mounted while closed, and after the viewer's
 * own action it is read again in the background (`revision`), so drafts in it survive both.
 */
export function EntityDetails({
  api,
  entityId,
  revision,
  name,
  kind,
  known,
  effectivePerspective,
  directory,
  knowledge,
  canAct,
  locked,
  conversing,
  onShowConversation,
  onRun,
  onSelect,
  onClose,
  profileEditing = null,
}: {
  readonly api: WorldApi;
  readonly entityId: string;
  /** The world screen's count of the viewer's own actions. */
  readonly revision: number;
  readonly name: string | null;
  readonly kind: EntityKind;
  readonly known: boolean;
  readonly effectivePerspective: string;
  readonly directory: readonly EntityRef[];
  readonly knowledge: readonly KnowledgeView[];
  readonly canAct: boolean;
  readonly locked: boolean;
  /** The conversation with this NPC is shown on the stage: its options live there. */
  readonly conversing: boolean;
  readonly onShowConversation: () => void;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onSelect: (entityId: string, kind: EntityKind) => void;
  readonly onClose: () => void;
  /** The DM's authoring session, for an NPC's edit; null outside the DM perspective. */
  readonly profileEditing?: ProfileEditing | null;
}) {
  const t = useT();
  const acting = effectivePerspective.startsWith('CHARACTER:');
  const [sheetOpen, setSheetOpen] = useState(false);
  const image = usePortrait(api, entityId);
  // People keep their round portrait; a thing or a place shows its approved image as a plate.
  const plate = useHeldImage(isFigure(kind) ? null : image);
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
  const { resource, retry, reread } = useResource(entityId, load);
  useRereadOn(revision, reread);
  const canReadSheet =
    (effectivePerspective === 'DM' && ['character', 'npc', 'creature'].includes(kind)) ||
    (kind === 'character' && effectivePerspective === `CHARACTER:${entityId}`);
  const visible = resource.status === 'ready' ? resource.value.context?.context.visibleState : null;
  const names = distinctNames(t, directory);
  return (
    <>
      <header className={`details-header${plate.held ? ' details-header--plate' : ''}`}>
        {plate.held ? (
          <span className="details-plate" aria-hidden="true">
            {plate.url && <img src={plate.url} alt="" draggable={false} />}
          </span>
        ) : (
          <Medallion image={image} kind={kind} size="xl" />
        )}
        <div className="details-title">
          <p className="eyebrow">{t('A closer look')}</p>
          <h2>{name ?? unidentifiedName(t, kind)}</h2>
          <p className="entity-kind">{t(kind)}</p>
        </div>
        <IconButton
          glyph="close"
          className="details-close"
          label={t('Close details')}
          onClick={onClose}
        />
      </header>
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={resource.status === 'error' ? resource.message : t('Loading entity details…')}
          onRetry={retry}
        />
      ) : (
        <>
          {resource.value.context && visible && (
            <>
              <ul className="details-facts">
                <li className={visible.present ? 'is-present' : ''}>
                  <Glyph name={visible.present ? 'look' : 'hidden'} />
                  {visible.present ? t('Present in your surroundings') : t('Known, but not here')}
                </li>
                {visible.hitPoints && (
                  <li>
                    <Glyph name="hit-points" />
                    {t('Hit points: {current} / {max}', {
                      current: visible.hitPoints.current,
                      max: visible.hitPoints.max,
                    })}
                  </li>
                )}
                {visible.distanceFt !== undefined && (
                  <li>
                    <Glyph name="move" />
                    {t('Distance: {feet} ft', { feet: visible.distanceFt })}
                  </li>
                )}
              </ul>
              <ContextActions
                api={api}
                context={resource.value.context}
                directory={directory}
                knowledge={knowledge}
                canAct={canAct}
                locked={locked}
                conversing={conversing}
                onShowConversation={onShowConversation}
                onRun={onRun}
              />
            </>
          )}
          {resource.value.knowledge && (
            <section className="related-leads" aria-label={t('Related leads')}>
              <h3>{t('Follow a lead')}</h3>
              <div className="lead-buttons">
                {resource.value.knowledge.relatedEntities
                  .filter((entity) => entity.entityId !== entityId)
                  .map((entity) => (
                    <button
                      key={entity.entityId}
                      onClick={() => {
                        onSelect(entity.entityId, entity.kind);
                      }}
                    >
                      {t('Explore {place}', { place: names.get(entity.entityId) ?? entity.name })}
                    </button>
                  ))}
              </div>
              {resource.value.knowledge.knowledge
                .filter((record) => record.knowledgeType === 'CONTRADICTION')
                .map((record) => (
                  <div className="contradiction-highlight" key={record.knowledgeId}>
                    <KnowledgeBadge type="CONTRADICTION" />
                    <p>{record.statement}</p>
                  </div>
                ))}
            </section>
          )}
          {effectivePerspective === 'DM' && kind === 'npc' && profileEditing && name !== null && (
            <NpcProfile entityId={entityId} name={name} editing={profileEditing} />
          )}
          {effectivePerspective === 'DM' && kind === 'npc' && (
            <PerformNpc
              api={api}
              npcId={entityId}
              npcName={name ?? entityId}
              directory={directory}
            />
          )}
          <EntityImages entityId={entityId} kind={kind} name={name ?? unidentifiedName(t, kind)} />
          <details className="disclosure">
            <summary>{t('Full knowledge')}</summary>
            <KnowledgeCards knowledge={resource.value.knowledge?.knowledge ?? []} />
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

/**
 * The full sheet on demand. A person the DM added in words has no sheet until one is set: the
 * server's 404 then says so plainly instead of a failure with Retry (Stage 360).
 */
function Sheet({ api, entityId }: { readonly api: WorldApi; readonly entityId: string }) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) =>
      api
        .get<CharacterSheetResponse>(`entities/${encodeURIComponent(entityId)}/sheet`, signal)
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        }),
    [api, entityId],
  );
  const { resource, retry } = useResource(entityId, load);
  if (resource.status === 'ready') {
    return resource.value ? (
      <CharacterSheetDetails name={resource.value.entity.name} sheet={resource.value.sheet} />
    ) : (
      <StatusPanel state="empty" label={t('No character sheet is recorded here.')} />
    );
  }
  return (
    <StatusPanel
      state={resource.status}
      label={
        resource.status === 'error' ? resource.message : t('Loading the full character sheet…')
      }
      onRetry={retry}
    />
  );
}
