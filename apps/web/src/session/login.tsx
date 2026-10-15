import { useState, type SubmitEvent } from 'react';

import type { Connection } from '../api/client.ts';
import { useT } from '@ltw/ui';

export function Login({ onConnect }: { readonly onConnect: (connection: Connection) => void }) {
  const t = useT();
  const [campaignId, setCampaign] = useState('ravenford');
  const [token, setToken] = useState('');
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    onConnect({ campaignId: campaignId.trim(), token: token.trim() });
    setToken('');
  }
  return (
    <main className="entry-layout">
      <section className="entry-story" aria-labelledby="entry-title">
        <a className="wordmark" href="#entry-title">
          <span aria-hidden="true">◈</span> {t('Living Tabletop World')}
        </a>
        <div className="entry-heading">
          <p className="eyebrow">{t('A world worth returning to')}</p>
          <h1 id="entry-title">
            {t('Every place')}
            <br />
            {t('has a story.')}
          </h1>
          <p>
            {t(
              'Step into your shared world. See what your character knows, explore the details, and keep your story close.',
            )}
          </p>
        </div>
        <p className="entry-footer">{t('Your character. Your perspective. One living world.')}</p>
      </section>
      <section className="entry-form" aria-labelledby="connect-title">
        <p className="eyebrow">{t('Take your seat')}</p>
        <h2 id="connect-title">{t('Enter your world')}</h2>
        <p>{t('Connect to your local campaign with the access token supplied by your host.')}</p>
        <form onSubmit={submit}>
          <label htmlFor="campaign">{t('Campaign')}</label>
          <input
            id="campaign"
            value={campaignId}
            onChange={(event) => {
              setCampaign(event.target.value);
            }}
            required
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
          />
          <label htmlFor="token">{t('Access token')}</label>
          <input
            id="token"
            type="password"
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
            }}
            required
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            className="primary-button"
            type="submit"
            disabled={!campaignId.trim() || !token.trim()}
          >
            Enter world <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="fine-print">
          {t('Local development session · Access stays in this tab and is cleared when you leave.')}
        </p>
      </section>
    </main>
  );
}
