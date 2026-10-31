import type { CampaignActivationView } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorkshopClient } from '../client.ts';
import { newestActivation } from './model.ts';
import { ActivationReview } from './review.tsx';
import { ActivationStatus } from './status.tsx';
import { useActivationStatus } from './use-activation.ts';

export function ActivationTab({
  client,
  draftId,
  revision,
  headRevision,
  onPendingChanged,
  onInspect,
  onRestore,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly revision: number;
  readonly headRevision: number;
  readonly onPendingChanged: (pending: boolean) => void;
  readonly onInspect: (revision: number) => void;
  readonly onRestore: (revision: number) => void;
}) {
  const t = useT(),
    status = useActivationStatus(client, draftId);
  const [accepted, setAccepted] = useState<CampaignActivationView | null>(null);
  const refresh = useRef(status.reread);
  refresh.current = status.reread;
  const accept = useCallback((value: CampaignActivationView) => {
    setAccepted(value);
    refresh.current();
  }, []);
  const activation = newestActivation(
    accepted,
    status.resource.status === 'ready' ? status.resource.value : null,
  );
  useEffect(() => {
    if (activation) onPendingChanged(false);
  }, [activation, onPendingChanged]);
  return (
    <section className="campaign-activation" aria-label={t('Campaign activation')}>
      {activation ? (
        <ActivationStatus
          client={client}
          draftId={draftId}
          activation={activation}
          onRefresh={status.reread}
        />
      ) : status.resource.status !== 'ready' ? (
        <StatusPanel
          state={status.resource.status}
          label={
            status.resource.status === 'error'
              ? t('Activation status could not be read. Try again.')
              : t('Reading activation status…')
          }
          onRetry={status.retry}
        />
      ) : revision !== headRevision ? (
        <section className="workshop-panel">
          <h3>{t('Restore historical content before activation')}</h3>
          <p>
            {t(
              'Only the latest saved revision can start a campaign. Review and restore this historical revision as a new revision first.',
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              onRestore(revision);
            }}
          >
            {t('Review restoration')}
          </button>
        </section>
      ) : (
        <ActivationReview
          key={`${revision}:${headRevision}`}
          client={client}
          draftId={draftId}
          revision={revision}
          onAccepted={accept}
          onPendingChanged={onPendingChanged}
          onInspect={() => {
            onInspect(revision);
          }}
        />
      )}
    </section>
  );
}
