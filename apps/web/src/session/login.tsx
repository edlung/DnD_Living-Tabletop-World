import { useT } from '@ltw/ui';
import { useState, type SubmitEvent } from 'react';

import type { Connection } from '../api/client.ts';
import { Glyph } from '../visual/glyph.tsx';
import { ornamentUrl, textureUrl } from '../visual/ui-kit.ts';

/**
 * Sign-in (docs/STAGE_320_DESIGN.md §5.8): the GPT key art full-bleed behind a glass panel with
 * the emblem, wordmark and tagline, the campaign and access-token fields and the notes. The
 * token lives only in memory; the field is cleared as soon as it is used.
 */
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
    <main className="sign-in">
      <img className="sign-in-art" src={textureUrl('brand-keyart')} alt="" />
      <div className="sign-in-scrim" aria-hidden="true" />
      <section className="sign-in-panel" aria-labelledby="entry-title">
        <p className="sign-in-brand">
          <img src={ornamentUrl('emblem')} alt="" />
          <span>{t('Living Tabletop World')}</span>
        </p>
        <div className="sign-in-story">
          <p className="eyebrow">{t('A world worth returning to')}</p>
          <h1 id="entry-title">
            {t('Every place')} <br />
            {t('has a story.')}
          </h1>
          <p>
            {t(
              'Step into your shared world. See what your character knows, explore the details, and keep your story close.',
            )}
          </p>
        </div>
        <img className="sign-in-divider" src={ornamentUrl('divider')} alt="" />
        <div className="sign-in-form" aria-labelledby="connect-title" role="group">
          <p className="eyebrow">{t('Take your seat')}</p>
          <h2 id="connect-title">{t('Enter your world')}</h2>
          <p className="muted">
            {t('Connect to your local campaign with the access token supplied by your host.')}
          </p>
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
              <Glyph name="sign-in" />
              {t('Enter world')}
            </button>
          </form>
          <p className="fine-print">
            {t(
              'Local development session · Access stays in this tab and is cleared when you leave.',
            )}
          </p>
        </div>
        <p className="sign-in-footer">{t('Your character. Your perspective. One living world.')}</p>
      </section>
    </main>
  );
}
