import { campaignAppearance } from '../visual/campaign-themes/index.ts';
import { campaignLibraryResponseSchema, type CampaignLibraryEntry } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useState } from 'react';

import { Glyph } from '../visual/glyph.tsx';

import '../styles/hub-library.css';

/**
 * The campaign library in the hub (docs/adr/0058-campaign-content.md, notes of 2026-11-19): every
 * authored campaign with its cover, what it is, and a party size; one press starts it with the
 * account as its DM. The library is read once; a hub whose server has none shows nothing here.
 */
export function HubLibrary({
  transport,
  busy,
  onStart,
}: {
  readonly transport: typeof fetch;
  /** What is being opened or made: `library:<id>` for one of these; null when nothing is. */
  readonly busy: string | null;
  readonly onStart: (pick: { readonly libraryId: string; readonly variantId: string }) => void;
}) {
  const t = useT();
  const [campaigns, setCampaigns] = useState<readonly CampaignLibraryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [variants, setVariants] = useState<Readonly<Record<string, string>>>({});
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const call = transport;
        const response = await call('/api/account/library', {
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        const parsed = response.ok
          ? campaignLibraryResponseSchema.safeParse(await response.json())
          : null;
        if (parsed?.success) setCampaigns(parsed.data.campaigns);
        else setFailed(true);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [transport]);

  if (failed || (campaigns !== null && campaigns.length === 0)) return null;
  return (
    <section className="hub-section" aria-labelledby="hub-library">
      <h3 id="hub-library">{t('Campaigns from the library')}</h3>
      <p className="muted">
        {t(
          'Written campaigns with their own pictures, figures and battle maps. Pick the number of players; the campaign starts as written, with you as its DM.',
        )}
      </p>
      {campaigns === null && <p role="status">{t('Loading the library…')}</p>}
      <ul className="hub-library" aria-labelledby="hub-library">
        {(campaigns ?? []).map((campaign) => {
          const select = `hub-library-variant-${campaign.id}`;
          const mine = busy === `library:${campaign.id}`;
          return (
            <li key={campaign.id} className="hub-library-card" {...campaignAppearance(campaign.id)}>
              <div className="hub-library-cover">
                <img
                  src={`/api/account/library/${encodeURIComponent(campaign.id)}/cover`}
                  alt=""
                  loading="lazy"
                  width={300}
                  height={200}
                />
              </div>
              <div className="hub-library-body">
                <h4>{campaign.title}</h4>
                <p className="hub-library-meta">
                  {campaign.genre} · {campaign.audience}
                </p>
                <p className="hub-library-pitch">{campaign.pitch}</p>
                <div className="hub-library-actions">
                  <label htmlFor={select}>{t('Players')}</label>
                  <select
                    id={select}
                    value={variants[campaign.id] ?? campaign.defaultVariant}
                    disabled={busy !== null}
                    onChange={(event) => {
                      setVariants({ ...variants, [campaign.id]: event.target.value });
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
                    disabled={busy !== null}
                    aria-label={t('Start «{title}»', { title: campaign.title })}
                    onClick={() => {
                      onStart({
                        libraryId: campaign.id,
                        variantId: variants[campaign.id] ?? campaign.defaultVariant,
                      });
                    }}
                  >
                    <Glyph name="chronicle" />
                    {mine ? t('Preparing the campaign…') : t('Start')}
                  </button>
                </div>
                {mine && (
                  <p className="hub-library-wait" role="status">
                    {t('This takes up to a minute or two: the world and its pictures are set up.')}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
