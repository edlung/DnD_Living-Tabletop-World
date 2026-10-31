import { CharacterSheetDetails, StatusPanel, useT } from '@ltw/ui';
import type { CampaignPreviewEntityRef } from '@ltw/contracts';
import { useCallback, useState } from 'react';

import { useResource } from '../../api/resource.ts';
import { useApprovedImage } from '../../visual/approved-images.ts';
import { Medallion } from '../../visual/medallion.tsx';
import { unidentifiedName } from '../../world/entity-words.ts';
import type { DraftPreviewApi } from './api.ts';
import type { PreviewScope } from './scope.ts';
import { PreviewKnowledge } from './knowledge.tsx';

export function PreviewEntityPanel({
  api,
  scope,
  entityId,
  onClose,
  onScenario,
  references,
}: {
  readonly api: DraftPreviewApi;
  readonly scope: PreviewScope;
  readonly entityId: string;
  readonly onClose: () => void;
  readonly onScenario?: (entityId: string) => void;
  readonly references: readonly CampaignPreviewEntityRef[];
}) {
  const t = useT();
  const load = useCallback((signal: AbortSignal) => api.entity(entityId, signal), [api, entityId]);
  const { resource, retry } = useResource(`preview-entity:${entityId}`, load);
  const [sheet, setSheet] = useState(false);
  const value = resource.status === 'ready' ? resource.value : null;
  const picture = useApprovedImage(value?.presentation.presentation.image ?? null);
  const mayReadSheet =
    value &&
    (scope.perspective === 'OWNER'
      ? ['character', 'npc', 'creature'].includes(value.entity.kind)
      : scope.characterId === value.entity.entityId);
  return (
    <aside
      className="workshop-panel workshop-preview-details"
      aria-label={t('Preview object details')}
    >
      <div className="workshop-section-heading">
        <h3>
          {value?.entity.name ??
            (value ? unidentifiedName(t, value.entity.kind) : t('A closer look'))}
        </h3>
        <button onClick={onClose}>{t('Close details')}</button>
      </div>
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={
            resource.status === 'error'
              ? t('Preview details could not be read.')
              : t('Loading entity details…')
          }
          onRetry={retry}
        />
      ) : (
        value && (
          <>
            {['character', 'npc', 'creature'].includes(value.entity.kind) ? (
              <Medallion
                kind={value.entity.kind}
                image={value.presentation.presentation.image}
                size="xl"
              />
            ) : (
              picture && <img className="workshop-preview-object-picture" src={picture} alt="" />
            )}
            <p>{value.entity.kind === 'npc' ? t('NPC') : t(value.entity.kind)}</p>
            {value.perspective.kind === 'OWNER' && value.ownerDescription !== undefined && (
              <p>{value.ownerDescription}</p>
            )}
            <PreviewKnowledge knowledge={value.knowledge} references={references} />
            <div className="workshop-preview-detail-actions">
              {mayReadSheet && (
                <button
                  aria-expanded={sheet}
                  onClick={() => {
                    setSheet((shown) => !shown);
                  }}
                >
                  {t('Full character sheet')}
                </button>
              )}
              {sheet && mayReadSheet && <PreviewSheet api={api} entityId={entityId} />}
              {scope.perspective === 'OWNER' && onScenario && (
                <button
                  onClick={() => {
                    onScenario(entityId);
                  }}
                >
                  {t('Open in scenario')}
                </button>
              )}
            </div>
          </>
        )
      )}
    </aside>
  );
}

function PreviewSheet({
  api,
  entityId,
}: {
  readonly api: DraftPreviewApi;
  readonly entityId: string;
}) {
  const t = useT();
  const load = useCallback((signal: AbortSignal) => api.sheet(entityId, signal), [api, entityId]);
  const { resource, retry } = useResource(`preview-sheet:${entityId}`, load);
  return resource.status === 'ready' ? (
    resource.value ? (
      <CharacterSheetDetails name={resource.value.entity.name} sheet={resource.value.sheet} />
    ) : (
      <p>{t('No character sheet is recorded here.')}</p>
    )
  ) : (
    <StatusPanel
      state={resource.status}
      label={
        resource.status === 'error'
          ? t('The character sheet could not be read.')
          : t('Loading the full character sheet…')
      }
      onRetry={retry}
    />
  );
}
