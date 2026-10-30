import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useMemo, useState } from 'react';

import { useResource } from '../../api/resource.ts';
import type { WorkshopClient } from '../client.ts';
import { OwnerPictures } from '../pictures/panel.tsx';
import { previewCatalogSchema } from './schemas.ts';
import { PreviewWorld } from './world.tsx';

export function OwnerPreviewTab({
  client,
  draftId,
  revision,
  onCharacter,
  initialEntityId,
  onScenario,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly revision: number;
  readonly onCharacter: (revision: number, characterId: string) => void;
  readonly initialEntityId?: string;
  readonly onScenario?: (revision: number, entityId: string) => void;
}) {
  const t = useT();
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await client.request(
        `/drafts/${draftId}/preview/catalog?revision=${String(revision)}`,
        previewCatalogSchema,
        { signal },
      );
      if (result.kind !== 'ready' || result.value.revision !== revision)
        throw new Error('PREVIEW_UNAVAILABLE');
      return result.value;
    },
    [client, draftId, revision],
  );
  const { resource, retry } = useResource(`preview-catalog:${revision}`, load);
  const [character, setCharacter] = useState('');
  const [picturesChanged, setPicturesChanged] = useState(0);
  const scope = useMemo(() => ({ revision, perspective: 'OWNER' as const }), [revision]);
  if (resource.status !== 'ready')
    return (
      <StatusPanel
        state={resource.status}
        label={
          resource.status === 'error'
            ? t('The world preview could not be read. Check the saved scenario.')
            : t('Preparing a view of the world…')
        }
        onRetry={retry}
      />
    );
  const choice = character || resource.value.characters[0]?.entityId || '';
  return (
    <div className="workshop-owner-preview">
      <div className="workshop-panel workshop-preview-character-choice">
        <label htmlFor="workshop-preview-character">{t('Choose a prepared character')}</label>
        <select
          id="workshop-preview-character"
          value={choice}
          onChange={(event) => {
            setCharacter(event.target.value);
          }}
        >
          {!resource.value.characters.length && (
            <option value="">{t('No prepared characters')}</option>
          )}
          {resource.value.characters.map((entry) => (
            <option key={entry.entityId} value={entry.entityId}>
              {entry.name}
            </option>
          ))}
        </select>
        <button
          disabled={!choice}
          onClick={() => {
            if (choice) onCharacter(revision, choice);
          }}
        >
          {t('Preview as character')}
        </button>
        <p>{t('Character preview shows only what this character initially knows or perceives.')}</p>
      </div>
      <PreviewWorld
        client={client}
        draftId={draftId}
        scope={scope}
        encounters={resource.value.encounters}
        refresh={picturesChanged}
        {...(initialEntityId ? { initialEntityId } : {})}
        {...(onScenario
          ? {
              onScenario: (id: string) => {
                onScenario(revision, id);
              },
            }
          : {})}
      />
      <OwnerPictures
        client={client}
        draftId={draftId}
        revision={revision}
        onChanged={() => {
          setPicturesChanged((value) => value + 1);
        }}
      />
    </div>
  );
}
