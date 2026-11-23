import { campaignAppearance } from '../visual/campaign-themes/index.ts';
import { campaignLibraryResponseSchema, type CampaignLibraryEntry } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useState } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { LibraryLook } from './library-look.tsx';
import { ShelfBook } from './shelf-book.tsx';

/**
 * The campaign library on the shelf (docs/adr/0058-campaign-content.md, notes of 2026-11-19; ADR
 * 0075 §10): every authored campaign a book in its own binding with its cover set in, what it is
 * on its label, and "Look inside" for its first page with the party size and the press that
 * starts it with the account as its DM. The library is read once; a server with none shows none.
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
  const [open, setOpen] = useState<string | null>(null);
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
  const looking = campaigns?.find((campaign) => campaign.id === open) ?? null;
  const cover = (id: string) => `/api/account/library/${encodeURIComponent(id)}/cover`;
  const close = () => {
    const id = open;
    setOpen(null);
    // Focus goes back to the label's button once the dialog is gone, never to the book itself.
    if (id !== null) {
      requestAnimationFrame(() => {
        document.getElementById(`hub-library-look-${id}`)?.focus();
      });
    }
  };
  return (
    <section className="hub-section" aria-labelledby="hub-library">
      <h3 id="hub-library">{t('Campaigns from the library')}</h3>
      <p className="hub-lead">
        {t(
          'Written campaigns with their own pictures, figures and battle maps. Look inside one, pick the number of players; the campaign starts as written, with you as its DM.',
        )}
      </p>
      {campaigns === null && <p role="status">{t('Loading the library…')}</p>}
      <ul className="hub-library shelf-row" aria-labelledby="hub-library">
        {(campaigns ?? []).map((campaign) => (
          <li
            key={campaign.id}
            className="hub-library-card shelf-item"
            {...campaignAppearance(campaign.id)}
          >
            <ShelfBook
              title={campaign.title}
              picture={cover(campaign.id)}
              onOpen={() => {
                setOpen(campaign.id);
              }}
            />
            <div className="shelf-label" data-surface="paper">
              <h4>{campaign.title}</h4>
              <p className="hub-library-meta">
                {campaign.genre} · {campaign.audience}
              </p>
              <button
                type="button"
                id={`hub-library-look-${campaign.id}`}
                aria-haspopup="dialog"
                aria-label={t('Look inside the book «{title}»', { title: campaign.title })}
                onClick={() => {
                  setOpen(campaign.id);
                }}
              >
                <Glyph name="chronicle" />
                {t('Look inside the book')}
              </button>
            </div>
            {looking?.id === campaign.id && (
              <LibraryLook
                campaign={campaign}
                picture={cover(campaign.id)}
                variant={variants[campaign.id] ?? campaign.defaultVariant}
                busy={busy !== null}
                mine={busy === `library:${campaign.id}`}
                onVariant={(variantId) => {
                  setVariants({ ...variants, [campaign.id]: variantId });
                }}
                onStart={() => {
                  onStart({
                    libraryId: campaign.id,
                    variantId: variants[campaign.id] ?? campaign.defaultVariant,
                  });
                }}
                onClose={close}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
