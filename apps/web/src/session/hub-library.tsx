import { campaignAppearance } from '../visual/campaign-themes/index.ts';
import { campaignLibraryResponseSchema, type CampaignLibraryEntry } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { LibraryLook } from './library-look.tsx';
import { ShelfBook } from './shelf-book.tsx';
import { inView, shelvesOf } from './shelf-order.ts';

/**
 * The campaign library on the shelf (docs/adr/0058-campaign-content.md, notes of 2026-11-19; ADR
 * 0075 §10, §20): every authored campaign a book in its own binding with its cover set in, on the
 * shelf of the age it is written for — the youngest first, each shelf one row with the rest a
 * press away, and the ages as an index at the library's head. A book is pressed to look inside:
 * its first page, the party size and the press that starts it with the account as its DM. The
 * library is read once; a server with none shows none.
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
  // The shelves unfolded to all their books, by their age mark.
  const [whole, setWhole] = useState<ReadonlySet<string>>(new Set());
  const [row, columns] = useColumns(campaigns !== null);
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
  const shelves = shelvesOf(campaigns ?? []);
  const cover = (campaignId: string) =>
    `/api/account/library/${encodeURIComponent(campaignId)}/cover`;
  // A fixed name: the ages' index leads to it by the address's fragment.
  const shelfId = (audience: string) => `hub-shelf-${String(Number.parseInt(audience, 10))}`;
  const close = () => {
    const closed = open;
    setOpen(null);
    // Focus goes back to the book once the dialog is gone.
    if (closed !== null) {
      requestAnimationFrame(() => {
        document.getElementById(`hub-library-look-${closed}`)?.focus();
      });
    }
  };
  return (
    <section className="hub-section" aria-labelledby="hub-library">
      <h3 id="hub-library">{t('Campaigns from the library')}</h3>
      <p className="hub-lead">
        {t(
          'Written campaigns with their own pictures, figures and battle maps, on shelves by age. Press a book to look inside and pick the number of players; the campaign starts as written, with you as its DM.',
        )}
      </p>
      {campaigns === null && <p role="status">{t('Loading the library…')}</p>}
      {shelves.length > 1 && (
        <nav className="hub-ages" aria-label={t('Shelves by age')}>
          <span className="hub-ages-word" aria-hidden="true">
            {t('Age')}
          </span>
          {shelves.map((shelf) => (
            <a key={shelf.audience} href={`#${shelfId(shelf.audience)}`}>
              {shelf.audience}
            </a>
          ))}
        </nav>
      )}
      {shelves.map((shelf, index) => {
        const unfolded = whole.has(shelf.audience);
        const shown = unfolded ? shelf.books : shelf.books.slice(0, inView(columns));
        return (
          <section
            key={shelf.audience}
            className="hub-shelf"
            aria-labelledby={shelfId(shelf.audience)}
          >
            <div className="hub-shelf-head">
              <h4 id={shelfId(shelf.audience)}>
                {t('Ages {audience}', { audience: shelf.audience })}
              </h4>
              {shelf.books.length > inView(columns) && (
                <button
                  type="button"
                  className="hub-shelf-all"
                  aria-expanded={unfolded}
                  aria-controls={`${shelfId(shelf.audience)}-books`}
                  onClick={() => {
                    const next = new Set(whole);
                    if (unfolded) next.delete(shelf.audience);
                    else next.add(shelf.audience);
                    setWhole(next);
                  }}
                >
                  {unfolded
                    ? t('Fold the shelf')
                    : t('The whole shelf: {count}', { count: shelf.books.length })}
                </button>
              )}
            </div>
            <ul
              id={`${shelfId(shelf.audience)}-books`}
              ref={index === 0 ? row : undefined}
              className="hub-library shelf-row"
              aria-labelledby={shelfId(shelf.audience)}
            >
              {shown.map((campaign) => (
                <li
                  key={campaign.id}
                  className="hub-library-card shelf-item"
                  {...campaignAppearance(campaign.id)}
                >
                  <button
                    type="button"
                    id={`hub-library-look-${campaign.id}`}
                    className="shelf-pick"
                    aria-haspopup="dialog"
                    aria-label={t('Look inside the book «{title}»', { title: campaign.title })}
                    aria-describedby={`hub-library-about-${campaign.id}`}
                    onClick={() => {
                      setOpen(campaign.id);
                    }}
                  >
                    <ShelfBook title={campaign.title} picture={cover(campaign.id)} />
                    <span className="shelf-caption">
                      <strong>{campaign.title}</strong>
                      <span id={`hub-library-about-${campaign.id}`}>{campaign.genre}</span>
                    </span>
                  </button>
                  {open === campaign.id && (
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
      })}
    </section>
  );
}

/**
 * How many books stand in one row of a shelf: the row's own grid, measured (the first shelf's
 * — every shelf is as wide), and measured again when the row's width changes.
 */
function useColumns(ready: boolean) {
  const row = useRef<HTMLUListElement>(null);
  const [columns, setColumns] = useState(4);
  useLayoutEffect(() => {
    const list = row.current;
    if (!list) return;
    const measure = () => {
      const tracks = getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean);
      // A list not laid out answers "none": the last count is kept.
      if (tracks.length > 0 && tracks[0] !== 'none') setColumns(tracks.length);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => {
      observer.disconnect();
    };
  }, [ready]);
  return [row, columns] as const;
}
