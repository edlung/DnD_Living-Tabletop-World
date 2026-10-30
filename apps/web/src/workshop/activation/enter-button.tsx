import { useT } from '@ltw/ui';
import { useRef, useState } from 'react';

import type { WorkshopClient } from '../client.ts';
import { useRequestSignal } from '../use-request-signal.ts';
import { enterOwnedCampaign } from './enter.ts';

export function EnterCampaignButton({
  client,
  campaignId,
}: {
  readonly client: WorkshopClient;
  readonly campaignId: string;
}) {
  const t = useT(),
    signal = useRequestSignal(),
    busy = useRef(false);
  const [state, setState] = useState<'idle' | 'opening' | 'failed'>('idle');
  const enter = async () => {
    if (busy.current) return;
    busy.current = true;
    setState('opening');
    const current = signal();
    const result = await enterOwnedCampaign({
      client,
      campaignId,
      signal: current,
      origin: window.location.origin,
      navigate: (path) => {
        window.location.assign(path);
      },
    });
    busy.current = false;
    if (result !== 'cancelled' && !current.aborted) setState(result);
  };
  return (
    <div className="campaign-entry">
      <button
        type="button"
        disabled={state === 'opening'}
        onClick={() => {
          void enter();
        }}
      >
        {state === 'opening' ? t('Opening campaign sign-in…') : t('Enter campaign')}
      </button>
      {state === 'failed' && (
        <p role="alert">
          {t('Campaign sign-in could not be opened. Try again for a new invitation.')}
        </p>
      )}
    </div>
  );
}
