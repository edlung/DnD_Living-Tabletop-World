import { BACKSTORY_CHARS, type BackstoryResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useId, useState } from 'react';

import type { WorldApi } from '../../api/client.ts';
import { useResource } from '../../api/resource.ts';

/**
 * A hero's backstory (docs/adr/0073-table-ideas.md §5): where the hero comes from, in its
 * player's own words. Its player and the DM read and write it — the DM for a child who tells it
 * aloud — and nobody else at the table; the page says who reads it before a word is typed. The
 * typed text is this screen's until "Save": a read in the background never replaces it.
 */
export function Backstory({
  api,
  characterId,
  name,
  asDm,
}: {
  readonly api: WorldApi;
  readonly characterId: string;
  readonly name: string;
  /** The DM's view: the words about who reads are the DM's. */
  readonly asDm: boolean;
}) {
  const t = useT();
  const ids = useId();
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<BackstoryResponse>(`entities/${encodeURIComponent(characterId)}/backstory`, signal),
    [api, characterId],
  );
  const { resource, reread } = useResource(`backstory:${characterId}`, load);
  const stored = resource.status === 'ready' ? resource.value : null;
  const [draft, setDraft] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle');
  // What was read fills the field once; after that the field is the writer's.
  useEffect(() => {
    if (stored !== null) setDraft((typed) => typed ?? stored.body);
  }, [stored]);
  const text = draft ?? '';
  const changed = stored !== null && text.trim() !== stored.body;
  const save = () => {
    if (state === 'busy' || !changed) return;
    setState('busy');
    void api
      .post(
        `entities/${encodeURIComponent(characterId)}/backstory`,
        { body: text },
        AbortSignal.timeout(20_000),
        true,
      )
      .then(
        () => {
          setState('saved');
          reread();
        },
        () => {
          setState('failed');
        },
      );
  };
  return (
    <section className="hero-section story-section" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Backstory')}</h3>
      <p className="story-who" id={`${ids}-who`}>
        {asDm
          ? t('You and this hero’s player read this. Nobody else at the table does.')
          : t('You and your DM read this. Nobody else at the table does.')}
      </p>
      {resource.status === 'error' ? (
        <p role="alert" className="authoring-notice error">
          {t('The backstory could not be read. Close the sheet and open it again.')}
        </p>
      ) : (
        <form
          className="hand-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          {!asDm && stored?.writtenBy === 'dm' && (
            <p className="muted">{t('The DM wrote this down. You may change it.')}</p>
          )}
          <label htmlFor={`${ids}-text`}>
            {t('Where does {name} come from, and what does {name} want?', { name })}
          </label>
          <textarea
            id={`${ids}-text`}
            rows={8}
            maxLength={BACKSTORY_CHARS}
            value={text}
            disabled={stored === null}
            aria-describedby={`${ids}-who ${ids}-room`}
            onChange={(event) => {
              setDraft(event.target.value);
              setState('idle');
            }}
          />
          <p className="muted" id={`${ids}-room`}>
            {t('{count} of {max} characters', { count: text.length, max: BACKSTORY_CHARS })}
          </p>
          <div className="action-row">
            <button
              type="submit"
              className="primary-button"
              aria-disabled={state === 'busy' || !changed}
            >
              {t('Save the backstory')}
            </button>
            <p role="status" className="story-status">
              {state === 'saved' ? t('Saved.') : ''}
            </p>
          </div>
          {state === 'failed' && (
            <p role="alert" className="authoring-notice error">
              {t('That was not saved. Try again.')}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
