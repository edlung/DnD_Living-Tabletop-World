import { useState, type SubmitEvent } from 'react';

import type { Connection } from '../api/client.ts';

export function Login({ onConnect }: { readonly onConnect: (connection: Connection) => void }) {
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
          <span aria-hidden="true">◈</span> Living Tabletop World
        </a>
        <div className="entry-heading">
          <p className="eyebrow">A world worth returning to</p>
          <h1 id="entry-title">
            Every place
            <br />
            has a story.
          </h1>
          <p>
            Step into your shared world. See what your character knows, explore the details, and
            keep your story close.
          </p>
        </div>
        <p className="entry-footer">Your character. Your perspective. One living world.</p>
      </section>
      <section className="entry-form" aria-labelledby="connect-title">
        <p className="eyebrow">Take your seat</p>
        <h2 id="connect-title">Enter your world</h2>
        <p>Connect to your local campaign with the access token supplied by your host.</p>
        <form onSubmit={submit}>
          <label htmlFor="campaign">Campaign</label>
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
          <label htmlFor="token">Access token</label>
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
          Local development session · Access stays in this tab and is cleared when you leave.
        </p>
      </section>
    </main>
  );
}
