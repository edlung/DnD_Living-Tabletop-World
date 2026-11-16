import { BACKSTORY_CHARS, type BackstoryResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { WorldApi } from '../../api/client.ts';
import { useResource } from '../../api/resource.ts';
import { useUnsaved } from './unsaved.ts';

/**
 * A hero's backstory (docs/adr/0073-table-ideas.md §5): where the hero comes from, in its
 * player's own words. Its player and the DM read and write it — the DM for a child who tells it
 * aloud — and nobody else at the table; the page says who reads it before a word is typed. Until
 * someone types, the field follows what is kept (the other of the two may be writing); once typed
 * in, it is this screen's until "Save", and the page says when the kept text changed meanwhile.
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
  const { resource, reread, retry } = useResource(`backstory:${characterId}`, load);
  const stored = resource.status === 'ready' ? resource.value : null;
  // Null while nobody has typed here: the field shows what is kept.
  const [draft, setDraft] = useState<string | null>(null);
  // What was kept when the typing began: a different text now means the other one wrote.
  const base = useRef<string | null>(null);
  // What was last saved from here, until the read that follows brings it back as kept.
  const sent = useRef<string | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle');
  const kept = stored?.body ?? null;
  // What was typed is what is kept (it was saved, or typed back): the field follows again.
  useEffect(() => {
    if (draft !== null && kept !== null && draft.trim() === kept) {
      setDraft(null);
      base.current = null;
      sent.current = null;
    }
  }, [draft, kept]);
  const text = draft ?? kept ?? '';
  const changed =
    draft !== null && kept !== null && draft.trim() !== kept && draft !== sent.current;
  const overwritten = changed && base.current !== null && base.current !== kept;
  useUnsaved(`backstory:${characterId}`, changed);
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
          sent.current = text;
          base.current = null;
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
          ? t(
              'You and this hero’s player read this, and either of you may change it. Nobody else at the table sees it.',
            )
          : t(
              'You and the DM read this, and either of you may change it. Nobody else at the table sees it.',
            )}
      </p>
      {resource.status === 'error' ? (
        <div className="action-row">
          <p role="alert" className="authoring-notice error">
            {t('The backstory could not be read.')}
          </p>
          <button type="button" onClick={retry}>
            {t('Try again')}
          </button>
        </div>
      ) : (
        <form
          className="hand-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          {!asDm && stored?.writtenBy === 'dm' && !changed && (
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
              if (draft === null) base.current = kept;
              setDraft(event.target.value);
              setState('idle');
            }}
          />
          <p className="muted" id={`${ids}-room`}>
            {t('{count} of {max} characters', { count: text.length, max: BACKSTORY_CHARS })}
          </p>
          {overwritten && (
            <p role="alert" className="authoring-notice">
              {t('This was changed while you were writing. Saving replaces it.')}
            </p>
          )}
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
