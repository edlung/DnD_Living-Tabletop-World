import { useT } from '@ltw/ui';
import { useState, type SubmitEvent } from 'react';

import { Glyph } from '../visual/glyph.tsx';

/**
 * Development personas' sign-in (ADR 0009; docs/STAGE_320_DESIGN.md §5.8): the campaign and
 * access-token fields and their note, inside the sign-in panel. Shown only by a server without
 * production sign-in. The token lives only in memory; the field is cleared as soon as it is used.
 */
export function PersonaForm({
  onConnect,
}: {
  readonly onConnect: (campaignId: string, token: string) => void;
}) {
  const t = useT();
  const [campaignId, setCampaign] = useState('ravenford');
  const [token, setToken] = useState('');
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    onConnect(campaignId.trim(), token.trim());
    setToken('');
  }
  return (
    <div className="sign-in-form" aria-labelledby="connect-title" role="group">
      <p className="eyebrow">{t('Take your seat')}</p>
      <h2 id="connect-title">{t('Enter your world')}</h2>
      <p className="muted">
        {t('Connect to your local campaign with the access token supplied by your host.')}
      </p>
      <form className="persona-form" onSubmit={submit}>
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
        {t('Local development session · Access stays in this tab and is cleared when you leave.')}
      </p>
    </div>
  );
}
