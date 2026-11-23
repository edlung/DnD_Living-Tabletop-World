import type { AccountResponse, CampaignTemplate } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useState } from 'react';

import { AboutButton } from '../guide/about.tsx';
import { NativeEntry } from '../native/native-entry.tsx';
import { askForBook, takeBookRequest } from '../shell/book-request.ts';
import { campaignAppearance } from '../visual/campaign-themes/index.ts';
import { Glyph } from '../visual/glyph.tsx';
import { ornamentUrl } from '../visual/ui-kit.ts';
import { readAccount, type EnterAnswer } from './account-flow.ts';
import { AccountData } from './account-data.tsx';
import { AccountSettings } from './account-settings.tsx';
import { CampaignLists } from './hub-campaigns.tsx';
import { HubLibrary } from './hub-library.tsx';
import { ShelfBook } from './shelf-book.tsx';

/**
 * The account's shelf (docs/adr/0041-accounts.md, Stage 600; docs/adr/0075-book-interface.md §10):
 * the campaigns it sits in standing as books in their own bindings, each with a label of who the
 * account is there and where the party is; opening one, a new campaign from a ready adventure or
 * the library with the account as its DM; and, on a page of its own, the name the table sees, the
 * password, the account's data and signing out.
 */
type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly account: AccountResponse }
  | { readonly kind: 'failed' };

/**
 * Ready adventures (docs/adr/0058-campaign-content.md §5), each in both languages; the words go
 * through `t()` like every other word on the page.
 */
const ADVENTURES: readonly {
  readonly title: string;
  readonly about: string;
  readonly copies: readonly { readonly template: CampaignTemplate; readonly language: string }[];
}[] = [
  {
    title: 'The Bells of Hollowmere',
    about: 'For a new party: levels 1 to 5 by milestones, four ready-made characters or your own.',
    copies: [
      { template: 'hollowmere-en', language: 'In English' },
      { template: 'hollowmere-ru', language: 'In Russian' },
    ],
  },
  {
    title: 'The Missing Caravan',
    about: 'A one-shot for a party of level 15.',
    copies: [
      { template: 'ravenford-en', language: 'In English' },
      { template: 'ravenford-ru', language: 'In Russian' },
    ],
  },
];

/** The shelf's room: the product's bookcase behind, the emblem and the wordmark at its head. */
export function HubPage(props: Parameters<typeof Hub>[0]) {
  const t = useT();
  return (
    <main className="shelf-page">
      <div className="shelf-room" aria-hidden="true" />
      <section className="shelf" aria-labelledby="hub-title">
        <p className="shelf-brand">
          <img src={ornamentUrl('emblem')} alt="" />
          <span>{t('Living Tabletop World')}</span>
        </p>
        <Hub {...props} />
        <AboutButton />
      </section>
    </main>
  );
}

export function Hub({
  transport = fetch,
  onOpen,
  onCreate,
  onCreateLibrary,
  onSignOut,
}: {
  readonly transport?: typeof fetch;
  readonly onOpen: (campaignId: string) => Promise<EnterAnswer>;
  readonly onCreate: (template: CampaignTemplate) => Promise<EnterAnswer>;
  /** A campaign from the campaign library (ADR 0058, notes of 2026-11-19); absent, none shown. */
  readonly onCreateLibrary?: (pick: {
    readonly libraryId: string;
    readonly variantId: string;
  }) => Promise<EnterAnswer>;
  readonly onSignOut: () => Promise<void>;
}) {
  const t = useT();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const reload = useCallback(() => {
    void readAccount(transport).then((reading) => {
      setLoad(
        reading.kind === 'account'
          ? { kind: 'ready', account: reading.account }
          : { kind: 'failed' },
      );
    });
  }, [transport]);
  useEffect(reload, [reload]);

  const run = async (key: string, action: () => Promise<EnterAnswer>) => {
    setBusy(key);
    setProblem(null);
    const answer = await action();
    if (answer.kind === 'entered') return;
    setBusy(null);
    setProblem(
      answer.kind === 'refused' && answer.reason === 'campaign-limit'
        ? t('You already lead ten campaigns of your own.')
        : answer.kind === 'refused'
          ? t('That campaign cannot be opened now.')
          : t('The table could not be reached. Check your connection, then try again.'),
    );
  };

  if (load.kind !== 'ready') {
    return (
      <div className="hub">
        <h1 id="hub-title" className="visually-hidden">
          {t('Your campaigns')}
        </h1>
        <StatusPanel
          state={load.kind === 'loading' ? 'loading' : 'error'}
          label={
            load.kind === 'loading'
              ? t('Opening your campaigns…')
              : t('Your campaigns could not be read.')
          }
          onRetry={reload}
        />
      </div>
    );
  }
  const { account } = load;
  return (
    <div className="hub">
      <header className="hub-head">
        <p className="eyebrow">{t('Signed in as {name}', { name: account.displayName })}</p>
        <h1 id="hub-title">{t('Your campaigns')}</h1>
        {/* The account's page stands after the whole library: one step to it from the top. */}
        <a className="text-link hub-to-account" href="#hub-account">
          {t('Your account')}
        </a>
      </header>
      {problem && (
        <p className="account-error" role="alert">
          {problem}
        </p>
      )}
      {account.campaigns.length === 0 ? (
        <p className="hub-empty">
          {t(
            'No campaign yet. Start one from a ready adventure below, or open the invitation link your DM sent.',
          )}
        </p>
      ) : (
        <CampaignLists
          campaigns={account.campaigns}
          busy={busy}
          onOpen={(campaignId) => void run(campaignId, () => onOpen(campaignId))}
          onBook={(campaignId) =>
            void run(`${campaignId}:book`, async () => {
              // The campaign opens at its book (ADR 0072 §1); an opening refused asks for none.
              askForBook(campaignId);
              const answer = await onOpen(campaignId);
              if (answer.kind !== 'entered') takeBookRequest(campaignId);
              return answer;
            })
          }
        />
      )}
      <NativeEntry />
      <section className="hub-section" aria-labelledby="hub-new">
        <h3 id="hub-new">{t('Lead a new campaign')}</h3>
        <p className="hub-lead">
          {t(
            'A fresh copy of a ready adventure with you as its DM; invite your players from the Players sheet.',
          )}
        </p>
        <ul className="shelf-row" aria-labelledby="hub-new">
          {ADVENTURES.map((adventure) => (
            <li
              key={adventure.title}
              className="shelf-item hub-adventure"
              {...campaignAppearance(adventure.title)}
            >
              <ShelfBook title={t(adventure.title)} />
              <div className="shelf-label" data-surface="paper">
                <h4>{t(adventure.title)}</h4>
                <p className="muted">{t(adventure.about)}</p>
                <div className="hub-templates">
                  {adventure.copies.map((entry) => (
                    <button
                      key={entry.template}
                      type="button"
                      disabled={busy !== null}
                      aria-label={t('{language}: {adventure}', {
                        language: t(entry.language),
                        adventure: t(adventure.title),
                      })}
                      onClick={() => void run(entry.template, () => onCreate(entry.template))}
                    >
                      <Glyph name="chronicle" />
                      {busy === entry.template ? t('Preparing the adventure…') : t(entry.language)}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {onCreateLibrary && (
        <HubLibrary
          transport={transport}
          busy={busy}
          onStart={(pick) => void run(`library:${pick.libraryId}`, () => onCreateLibrary(pick))}
        />
      )}
      <div className="shelf-account" data-surface="paper">
        <AccountSettings transport={transport} account={account} onRenamed={reload} />
        <AccountData
          transport={transport}
          login={account.login}
          onDeleted={() => void onSignOut()}
        />
        <div className="action-row">
          <button type="button" onClick={() => void onSignOut()}>
            <Glyph name="leave" />
            {t('Sign out')}
          </button>
        </div>
      </div>
    </div>
  );
}
