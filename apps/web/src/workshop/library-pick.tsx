import { campaignAppearance } from '../visual/campaign-themes/index.ts';
import {
  campaignLibraryResponseSchema,
  campaignPackageSchema,
  type CampaignLibraryEntry,
  type CampaignPackage,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useState } from 'react';

import type { WorkshopClient } from './client.ts';
import { useRequestSignal } from './use-request-signal.ts';

/**
 * The campaign library (docs/adr/0058-campaign-content.md, notes of 2026-11-14): authored campaigns
 * with their pictures. Picking one hands its package to the import above, which previews it and
 * saves it into this empty draft; its pictures arrive when the campaign is started.
 */
export function CampaignLibraryPick({
  client,
  disabled,
  onPick,
}: {
  readonly client: WorkshopClient;
  readonly disabled: boolean;
  readonly onPick: (content: CampaignPackage) => void;
}) {
  const t = useT(),
    signal = useRequestSignal();
  const [campaigns, setCampaigns] = useState<readonly CampaignLibraryEntry[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'picking' | 'pick-failed'>(
    'loading',
  );
  const [variants, setVariants] = useState<Readonly<Record<string, string>>>({});
  useEffect(() => {
    const active = signal();
    void client
      .request('/library', campaignLibraryResponseSchema, { signal: active })
      .then((result) => {
        if (active.aborted) return;
        if (result.kind === 'ready') {
          setCampaigns(result.value.campaigns);
          setState('ready');
        } else if (result.kind !== 'cancelled') setState('failed');
      });
  }, [client, signal]);
  const pick = async (campaign: CampaignLibraryEntry) => {
    const variant = variants[campaign.id] ?? campaign.defaultVariant;
    const active = signal();
    setState('picking');
    const result = await client.request(
      `/library/${campaign.id}/packages/${variant}`,
      campaignPackageSchema,
      { signal: active },
    );
    if (active.aborted) return;
    if (result.kind === 'ready') {
      setState('ready');
      onPick(result.value);
    } else setState('pick-failed');
  };
  if (state === 'failed' || (campaigns !== null && campaigns.length === 0)) return null;
  return (
    <section className="campaign-library" aria-label={t('Ready campaigns')}>
      <h3>{t('Ready campaigns')}</h3>
      <p>
        {t(
          'Pick a campaign and the number of players. Its pictures, figures and battle maps arrive when the campaign starts.',
        )}
      </p>
      {campaigns === null && <p role="status">{t('Loading the library…')}</p>}
      {state === 'pick-failed' && (
        <p role="alert">{t('The campaign could not be loaded. Try again.')}</p>
      )}
      <ul className="campaign-library-list">
        {(campaigns ?? []).map((campaign) => {
          const select = `library-variant-${campaign.id}`;
          return (
            <li
              key={campaign.id}
              className="campaign-library-card"
              {...campaignAppearance(campaign.id)}
            >
              <div className="campaign-library-cover">
                <img
                  src={`/api/workshop/library/${campaign.id}/cover`}
                  alt=""
                  loading="lazy"
                  width={300}
                  height={200}
                />
              </div>
              <div className="campaign-library-body">
                <h4>{campaign.title}</h4>
                <p className="campaign-library-meta">
                  {campaign.genre} · {campaign.audience} ·{' '}
                  {t('Pictures: {count}', { count: campaign.pictures })}
                </p>
                <p className="campaign-library-pitch">{campaign.pitch}</p>
                <div className="campaign-library-actions">
                  <label htmlFor={select}>{t('Players')}</label>
                  <select
                    id={select}
                    value={variants[campaign.id] ?? campaign.defaultVariant}
                    disabled={disabled || state === 'picking'}
                    onChange={(e) => {
                      setVariants({ ...variants, [campaign.id]: e.target.value });
                    }}
                  >
                    {campaign.variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={disabled || state === 'picking'}
                    aria-label={t('Choose «{title}»', { title: campaign.title })}
                    onClick={() => {
                      void pick(campaign);
                    }}
                  >
                    {t('Choose')}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
