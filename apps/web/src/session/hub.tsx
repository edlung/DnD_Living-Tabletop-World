import type { AccountCampaign, AccountResponse, CampaignTemplate } from '@ltw/contracts';
import { StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useCallback, useEffect, useId, useState, type SubmitEvent } from 'react';

import { AboutButton } from '../guide/about.tsx';
import { NativeEntry } from '../native/native-entry.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { ornamentUrl, textureUrl } from '../visual/ui-kit.ts';
import { changePassword, readAccount, renameAccount, type EnterAnswer } from './account-flow.ts';
import { AccountData } from './account-data.tsx';
import { Field, useFocusFirstInvalid } from './account-forms.tsx';

/**
 * The account's hub (docs/adr/0041-accounts.md, Stage 600): the campaigns it sits in (the DM's and
 * the player's), opening one, a new campaign from a ready adventure with the account as its DM, the
 * name the table sees, the password, and signing out.
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

/** The hub's page: the key art behind a wider glass panel with the emblem and the wordmark. */
export function HubPage(props: Parameters<typeof Hub>[0]) {
  const t = useT();
  return (
    <main className="sign-in hub-page">
      <img className="sign-in-art" src={textureUrl('brand-keyart')} alt="" />
      <div className="sign-in-scrim" aria-hidden="true" />
      <section className="sign-in-panel hub-panel" aria-labelledby="hub-title">
        <p className="sign-in-brand">
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
  onSignOut,
}: {
  readonly transport?: typeof fetch;
  readonly onOpen: (campaignId: string) => Promise<EnterAnswer>;
  readonly onCreate: (template: CampaignTemplate) => Promise<EnterAnswer>;
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
      </header>
      {problem && (
        <p className="account-error" role="alert">
          {problem}
        </p>
      )}
      {account.campaigns.length === 0 ? (
        <p className="muted">
          {t(
            'No campaign yet. Start one from a ready adventure below, or open the invitation link your DM sent.',
          )}
        </p>
      ) : (
        <ul className="hub-campaigns" aria-labelledby="hub-title">
          {account.campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.campaignId}
              campaign={campaign}
              busy={busy !== null}
              opening={busy === campaign.campaignId}
              onOpen={() => void run(campaign.campaignId, () => onOpen(campaign.campaignId))}
            />
          ))}
        </ul>
      )}
      <NativeEntry />
      <section className="hub-section" aria-labelledby="hub-new">
        <h3 id="hub-new">{t('Lead a new campaign')}</h3>
        <p className="muted">
          {t(
            'A fresh copy of a ready adventure with you as its DM; invite your players from the Players sheet.',
          )}
        </p>
        <ul className="hub-adventures" aria-labelledby="hub-new">
          {ADVENTURES.map((adventure) => (
            <li key={adventure.title} className="hub-adventure">
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
            </li>
          ))}
        </ul>
      </section>
      <AccountSettings transport={transport} account={account} onRenamed={reload} />
      <AccountData transport={transport} login={account.login} onDeleted={() => void onSignOut()} />
      <div className="action-row">
        <button type="button" onClick={() => void onSignOut()}>
          <Glyph name="leave" />
          {t('Sign out')}
        </button>
      </div>
    </div>
  );
}

function CampaignCard({
  campaign,
  busy,
  opening,
  onOpen,
}: {
  readonly campaign: AccountCampaign;
  readonly busy: boolean;
  readonly opening: boolean;
  readonly onOpen: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const titleId = useId();
  // A server from before moves sends none.
  const away = campaign.away ?? null;
  const who =
    campaign.role === 'dm'
      ? t('You are the DM')
      : t('You play {name}', {
          name:
            campaign.characters.map((character) => character.name).join(', ') || t('a character'),
        });
  return (
    <li className="hub-campaign" aria-labelledby={titleId}>
      <Glyph name={campaign.role === 'dm' ? 'game-master' : 'character'} />
      <div className="hub-campaign-text">
        <h3 id={titleId}>{campaign.name}</h3>
        <p className="muted">
          {who} · {campaign.language === 'ru' ? t('Russian') : t('English')}
        </p>
        {away !== null && (
          <p className="hub-campaign-away">
            {t('Played on {where} since {when}: here you can look, not play.', {
              where: away.destination,
              when: new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(
                new Date(away.movedAt),
              ),
            })}
          </p>
        )}
      </div>
      <button
        type="button"
        className="primary-button"
        disabled={busy}
        aria-label={t('Open {campaign}: {who}', { campaign: campaign.name, who })}
        onClick={onOpen}
      >
        {opening ? t('Opening…') : t('Open')}
      </button>
    </li>
  );
}

/** The name the table sees, and the password (the current one first). */
function AccountSettings({
  transport,
  account,
  onRenamed,
}: {
  readonly transport: typeof fetch;
  readonly account: AccountResponse;
  readonly onRenamed: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(account.displayName);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [nameMissing, setNameMissing] = useState(false);
  const [passwordProblem, setPasswordProblem] = useState<'current' | 'next' | null>(null);
  const [nameAttempt, setNameAttempt] = useState(0);
  const [passwordAttempt, setPasswordAttempt] = useState(0);
  const nameForm = useFocusFirstInvalid(nameAttempt);
  const passwordForm = useFocusFirstInvalid(passwordAttempt);
  async function rename(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameMissing(name.trim() === '');
    if (name.trim() === '') {
      setNameAttempt((value) => value + 1);
      return;
    }
    const answer = await renameAccount(transport, name.trim());
    setNote(answer.kind === 'done' ? t('Your name is saved.') : t('Your name could not be saved.'));
    if (answer.kind === 'done') onRenamed();
  }
  async function repass(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = current === '' ? 'current' : next.length < 10 ? 'next' : null;
    setPasswordProblem(problem);
    if (problem !== null) {
      setPasswordAttempt((value) => value + 1);
      return;
    }
    const answer = await changePassword(transport, current, next);
    setCurrent('');
    setNext('');
    setNote(
      answer.kind === 'done'
        ? t('Your password is changed. Other devices sign in again.')
        : answer.kind === 'refused' && answer.status === 403
          ? t('The current password is not right.')
          : t('Your password could not be changed.'),
    );
  }
  return (
    <section className="hub-section" aria-labelledby="hub-account">
      <h3 id="hub-account">{t('Your account')}</h3>
      <p className="muted">{t('Login: {login}', { login: account.login })}</p>
      <div className="hub-settings">
        <form
          ref={nameForm}
          className="account-form"
          noValidate
          onSubmit={(event) => void rename(event)}
        >
          <Field
            label={t('Your name at the table')}
            error={nameMissing ? t('Enter the name the table will see.') : null}
          >
            {(control) => (
              <input
                {...control}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                maxLength={60}
                autoComplete="nickname"
              />
            )}
          </Field>
          <button type="submit">{t('Save the name')}</button>
        </form>
        <form
          ref={passwordForm}
          className="account-form"
          noValidate
          onSubmit={(event) => void repass(event)}
        >
          <Field
            label={t('Current password')}
            error={passwordProblem === 'current' ? t('Enter your password.') : null}
          >
            {(control) => (
              <input
                {...control}
                type="password"
                value={current}
                onChange={(event) => {
                  setCurrent(event.target.value);
                }}
                autoComplete="current-password"
              />
            )}
          </Field>
          <Field
            label={t('New password')}
            hint={t('At least 10 characters. A short phrase is easy to remember.')}
            error={passwordProblem === 'next' ? t('Use at least 10 characters.') : null}
          >
            {(control) => (
              <input
                {...control}
                type="password"
                value={next}
                onChange={(event) => {
                  setNext(event.target.value);
                }}
                maxLength={200}
                autoComplete="new-password"
              />
            )}
          </Field>
          <button type="submit">{t('Change the password')}</button>
        </form>
      </div>
      {note && (
        <p className="fine-print" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
