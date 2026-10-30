import { ownedCampaignListSchema, type OwnedCampaign } from '@ltw/contracts';
import { StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useCallback, useState } from 'react';

import { useResource } from '../../api/resource.ts';
import { EnterCampaignButton } from '../activation/enter-button.tsx';
import type { WorkshopClient } from '../client.ts';
import { useRequestSignal } from '../use-request-signal.ts';
import { workshopDraftPath } from '../route.ts';

export function OwnedCampaigns({
  client,
  onOpenDraft,
}: {
  readonly client: WorkshopClient;
  readonly onOpenDraft: (draftId: string) => void;
}) {
  const t = useT(),
    language = useLanguage(),
    signal = useRequestSignal();
  const load = useCallback(
    async (current: AbortSignal) => {
      const result = await client.request('/campaigns', ownedCampaignListSchema, {
        signal: current,
      });
      if (result.kind !== 'ready') throw new Error('WORKSHOP_READ_FAILED');
      return result.value;
    },
    [client],
  );
  const { resource, retry, reread } = useResource('owned-campaigns', load);
  const [older, setOlder] = useState<{
    campaigns: readonly OwnedCampaign[];
    nextCursor: string | null;
  } | null>(null);
  const [paging, setPaging] = useState<'idle' | 'busy' | 'failed'>('idle');
  const rows =
    resource.status === 'ready'
      ? [...resource.value.campaigns, ...(older?.campaigns ?? [])].filter(
          (row, index, all) =>
            all.findIndex((other) => other.campaignId === row.campaignId) === index,
        )
      : [];
  const cursor = older
    ? older.nextCursor
    : resource.status === 'ready'
      ? resource.value.nextCursor
      : null;
  const more = async () => {
    if (!cursor || paging === 'busy') return;
    setPaging('busy');
    const current = signal();
    const result = await client.request(
      `/campaigns?after=${encodeURIComponent(cursor)}`,
      ownedCampaignListSchema,
      { signal: current },
    );
    if (current.aborted || result.kind === 'cancelled' || result.kind === 'signed-out') return;
    setPaging(result.kind === 'ready' ? 'idle' : 'failed');
    if (result.kind === 'ready')
      setOlder((previous) => ({
        campaigns: [...(previous?.campaigns ?? []), ...result.value.campaigns],
        nextCursor: result.value.nextCursor,
      }));
  };
  return (
    <section
      className="workshop-panel workshop-owned-campaigns"
      aria-labelledby="owned-campaigns-title"
    >
      <div className="workshop-section-heading">
        <h2 id="owned-campaigns-title">{t('Your campaigns')}</h2>
        <button type="button" onClick={reread}>
          {t('Refresh campaigns')}
        </button>
      </div>
      <p>
        {t(
          'Campaigns you confirmed in this workshop. Each opens through its own normal game invitation.',
        )}
      </p>
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={
            resource.status === 'error'
              ? t('Your campaigns could not be read. Try again.')
              : t('Reading your campaigns…')
          }
          onRetry={retry}
        />
      ) : rows.length === 0 ? (
        <p>{t('Your confirmed campaigns will appear here after preparation finishes.')}</p>
      ) : (
        <ul className="workshop-campaign-list">
          {rows.map((campaign) => (
            <li key={campaign.campaignId}>
              <h3>{campaign.title}</h3>
              <p>
                {t('Confirmed revision: {revision}', { revision: campaign.revision })} ·{' '}
                <time dateTime={campaign.publishedAt}>
                  {new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(
                    new Date(campaign.publishedAt),
                  )}
                </time>
              </p>
              <EnterCampaignButton client={client} campaignId={campaign.campaignId} />
              <a
                href={workshopDraftPath(campaign.draftId)}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onOpenDraft(campaign.draftId);
                }}
              >
                {t('Open source draft')}
              </a>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <button
          type="button"
          disabled={paging === 'busy'}
          onClick={() => {
            void more();
          }}
        >
          {t('More campaigns')}
        </button>
      )}
      {paging === 'failed' && (
        <p role="alert">{t('More campaigns could not be read. Try again.')}</p>
      )}
    </section>
  );
}
