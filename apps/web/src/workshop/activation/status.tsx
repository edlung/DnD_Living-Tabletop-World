import { campaignActivationAnswerSchema, type CampaignActivationView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useRef, useState } from 'react';

import type { WorkshopClient } from '../client.ts';
import { useRequestSignal } from '../use-request-signal.ts';
import { EnterCampaignButton } from './enter-button.tsx';

export function ActivationStatus({
  client,
  draftId,
  activation,
  onRefresh,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly activation: CampaignActivationView;
  readonly onRefresh: () => void;
}) {
  const t = useT(),
    signal = useRequestSignal(),
    busy = useRef(false);
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const retry = async () => {
    if (busy.current) return;
    busy.current = true;
    setState('busy');
    const current = signal();
    const result = await client.request(
      `/drafts/${draftId}/activation/${activation.activationId}/retry`,
      campaignActivationAnswerSchema,
      { body: {}, signal: current },
    );
    busy.current = false;
    if (current.aborted || result.kind === 'cancelled' || result.kind === 'signed-out') return;
    setState(
      result.kind === 'ready' &&
        result.value.activation?.activationId === activation.activationId &&
        result.value.activation.draftId === draftId
        ? 'idle'
        : 'failed',
    );
    onRefresh();
  };
  return (
    <section
      className="workshop-panel campaign-activation-status"
      aria-labelledby="activation-status-title"
    >
      <h3 id="activation-status-title">
        {activation.status === 'PUBLISHED'
          ? t('Campaign ready to play')
          : t('Preparing your campaign')}
      </h3>
      <p>{t('Confirmed revision: {revision}', { revision: activation.revision })}</p>
      <p>
        {activation.textOnly
          ? t('Text-only campaign. No draft pictures are copied.')
          : t('The confirmed picture choices are copied exactly.')}
      </p>
      <p>{t('Later draft changes do not change this campaign or its played history.')}</p>
      {activation.status === 'PUBLISHED' ? (
        <>
          <p>
            {t(
              'Enter through a normal invitation. This browser asks before replacing another game sign-in.',
            )}
          </p>
          <EnterCampaignButton client={client} campaignId={activation.campaignId} />
        </>
      ) : (
        <>
          <p role="status">
            {activation.failureCode
              ? t('Preparation needs attention. Retry continues the same confirmed campaign.')
              : activation.phase === 'BOOTSTRAPPED'
                ? t('Checking the prepared world before opening it for play…')
                : activation.phase === 'CONTENT_READY'
                  ? t('Creating the initial world from your confirmed revision…')
                  : t('Preparing the confirmed scenario and pictures…')}
          </p>
          <p>
            {t(
              'The campaign opens for play after preparation finishes. Closing this page does not reverse your confirmation.',
            )}
          </p>
          {activation.retryable && (
            <button
              type="button"
              disabled={state === 'busy'}
              onClick={() => {
                void retry();
              }}
            >
              {state === 'busy' ? t('Retrying activation…') : t('Retry activation')}
            </button>
          )}
          {state === 'failed' && (
            <p role="alert">
              {t(
                'The retry answer could not be confirmed. Refresh the status or retry the same campaign.',
              )}
            </p>
          )}
        </>
      )}
      <button type="button" disabled={state === 'busy'} onClick={onRefresh}>
        {t('Refresh activation status')}
      </button>
    </section>
  );
}
