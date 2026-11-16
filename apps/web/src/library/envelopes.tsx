import {
  ENVELOPE_LABEL_MAX,
  MAX_ENVELOPES,
  type DmEnvelopeView,
  type DmEnvelopesResponse,
  type EnvelopeOpens,
} from '@ltw/contracts';
import { useLanguage, useT, type Translate } from '@ltw/ui';
import { useCallback, useEffect, useId, useRef, useState, type SubmitEvent } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { formatWhen } from '../dm/players.ts';
import { Glyph } from '../visual/glyph.tsx';

const wait = () => AbortSignal.timeout(20_000);

/** What opens an envelope, as the DM's list says it. */
export const opensWords = (t: Translate, envelope: Pick<DmEnvelopeView, 'opens' | 'evening'>) =>
  envelope.opens === 'word'
    ? t('Opens when you say')
    : envelope.evening === null
      ? t('Opens when the next evening’s chapter is written')
      : t('Opens when the chapter of “{evening}” is written', { evening: envelope.evening });

/** The DM's envelopes, read by the list and reread after each sealing. */
export function useEnvelopes(api: WorldApi) {
  const load = useCallback(
    (signal: AbortSignal) => api.get<DmEnvelopesResponse>('dm/envelopes', signal, false),
    [api],
  );
  return useResource('dm-envelopes', load);
}

/**
 * The form that seals a kept handout (docs/adr/0073-table-ideas.md §9): what the outside says —
 * all the party reads until it opens — and what opens it: the DM's word, or the writing of the
 * evening's chapter. The handout stays in the library; the envelope takes a copy of it. It stands
 * in place of the card's own buttons, as the card's "Change" form does.
 */
export function SealForm({
  api,
  entryId,
  title,
  pictured,
  onDone,
}: {
  readonly api: WorldApi;
  readonly entryId: string;
  readonly title: string;
  /** The handout shows a picture: the envelope opens only once the party knows what is on it. */
  readonly pictured: boolean;
  /** The form closes: sealed, or put away. */
  readonly onDone: (sealed: boolean) => void;
}) {
  const t = useT();
  const ids = useId();
  const [label, setLabel] = useState('');
  const [opens, setOpens] = useState<EnvelopeOpens>('word');
  const [state, setState] = useState<'idle' | 'busy' | 'empty' | 'full' | 'failed'>('idle');
  // The envelope's ID is made once a form: a retried request seals one envelope.
  const [envelopeId] = useState(() => crypto.randomUUID());
  const outside = useRef<HTMLInputElement>(null);
  useEffect(() => {
    outside.current?.focus();
  }, []);
  const seal = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state === 'busy') return;
    if (label.trim() === '') {
      setState('empty');
      outside.current?.focus();
      return;
    }
    setState('busy');
    void api
      .post(`dm/envelopes/${envelopeId}`, { entryId, label: label.trim(), opens }, wait())
      .then(
        () => {
          onDone(true);
        },
        (failure: unknown) => {
          setState(failure instanceof ApiError && failure.status === 409 ? 'full' : 'failed');
        },
      );
  };
  return (
    <form
      className="hand-form envelope-form"
      noValidate
      aria-labelledby={`${ids}-title`}
      onSubmit={seal}
    >
      <h4 id={`${ids}-title`}>{t('Seal in an envelope: {title}', { title })}</h4>
      <div className="account-field">
        <label htmlFor={`${ids}-label`}>{t('What the outside says')}</label>
        <input
          ref={outside}
          id={`${ids}-label`}
          value={label}
          maxLength={ENVELOPE_LABEL_MAX}
          aria-describedby={`${ids}-hint${state === 'empty' ? ` ${ids}-empty` : ''}`}
          aria-invalid={state === 'empty'}
          autoComplete="off"
          onChange={(event) => {
            setLabel(event.target.value);
            if (state === 'empty') setState('idle');
          }}
        />
        <p id={`${ids}-hint`} className="field-hint">
          {t(
            'The party reads this while it is sealed — “Open after the battle”, “For the bravest”. Nothing of the inside shows. Up to {max} characters.',
            { max: ENVELOPE_LABEL_MAX },
          )}
        </p>
        {state === 'empty' && (
          <p id={`${ids}-empty`} role="alert" className="account-field-error">
            {t('Write what the outside says.')}
          </p>
        )}
      </div>
      <div className="account-field">
        <label htmlFor={`${ids}-opens`}>{t('It opens')}</label>
        <select
          id={`${ids}-opens`}
          value={opens}
          aria-describedby={`${ids}-opens-hint`}
          onChange={(event) => {
            setOpens(event.target.value === 'chapter' ? 'chapter' : 'word');
          }}
        >
          <option value="word">{t('When I open it')}</option>
          <option value="chapter">{t('By itself, when the evening’s chapter is written')}</option>
        </select>
        <p id={`${ids}-opens-hint`} className="field-hint">
          {opens === 'chapter'
            ? t(
                'The game on now, or the next one if none is on. If that evening ends with no chapter, it stays sealed until you open it.',
              )
            : t('It waits in “Envelopes” below until you press “Open it now”.')}
        </p>
      </div>
      <p className="field-hint">
        {t('It holds a copy: changing the kept handout later does not change it.')}
        {pictured &&
          ` ${t('It has a picture: it opens only once the party knows what is pictured.')}`}
      </p>
      {state === 'full' && (
        <p role="alert" className="account-field-error">
          {t('A campaign holds {max} envelopes. Delete one first.', { max: MAX_ENVELOPES })}
        </p>
      )}
      {state === 'failed' && (
        <p role="alert" className="account-field-error">
          {t('The envelope could not be sealed. Try again.')}
        </p>
      )}
      <div className="action-row">
        <button type="submit" className="primary-button" aria-disabled={state === 'busy'}>
          {t('Seal it')}
        </button>
        <button
          type="button"
          onClick={() => {
            onDone(false);
          }}
        >
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}

/**
 * The DM's envelopes (docs/adr/0073-table-ideas.md §9): the sealed ones — what the outside says,
 * what is inside, what opens it — with "Open it now" and "Delete"; then those opened. Deleting
 * asks first: a sealed envelope deleted never opens. Shown while there is one, or a last word
 * about one to say.
 */
export function DmEnvelopes({
  api,
  envelopes,
  onChanged,
}: {
  readonly api: WorldApi;
  readonly envelopes: readonly DmEnvelopeView[];
  readonly onChanged: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const ids = useId();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  // What the section says of the last press, and what failed on one envelope.
  const [said, setSaid] = useState('');
  const [failed, setFailed] = useState<{ readonly id: string; readonly word: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking !== null) keep.current?.focus();
  }, [asking]);
  if (envelopes.length === 0 && said === '') return null;
  const rowOf = (envelopeId: string) =>
    list.current?.querySelector<HTMLElement>(`[data-envelope="${CSS.escape(envelopeId)}"]`);
  const act = (envelope: DmEnvelopeView, what: 'open' | 'delete') => {
    if (busy) return;
    setBusy(true);
    setSaid('');
    setFailed(null);
    void api
      .post(`dm/envelopes/${envelope.envelopeId}/${what}`, {}, wait())
      .then(
        () => {
          setAsking(null);
          if (what === 'open') {
            setSaid(t('Opened: the party has it as a handout.'));
            // The button pressed is gone: its row keeps the focus.
            requestAnimationFrame(() => rowOf(envelope.envelopeId)?.focus());
          } else {
            setSaid(t('Envelope deleted.'));
            // The row is gone: the section's heading takes the focus.
            requestAnimationFrame(() => heading.current?.focus());
          }
        },
        (failure: unknown) => {
          setFailed({
            id: envelope.envelopeId,
            word:
              what === 'open' && failure instanceof ApiError && failure.status === 422
                ? t('It cannot open yet: the party does not know what is pictured inside.')
                : t('That did not work. Try again.'),
          });
        },
      )
      .finally(() => {
        setBusy(false);
        onChanged();
      });
  };
  return (
    <section className="sheet-section envelopes" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`} ref={heading} tabIndex={-1}>
        {t('Envelopes')}
      </h3>
      <p role="status" className="muted">
        {said}
      </p>
      <ul className="notes kept-list" ref={list}>
        {envelopes.map((envelope) => {
          const sealed = envelope.openedAt === null;
          return (
            <li
              key={envelope.envelopeId}
              className="note envelope-card"
              data-envelope={envelope.envelopeId}
              tabIndex={-1}
            >
              <div className="section-heading">
                <strong>
                  <Glyph name="secret" />
                  {envelope.label}
                </strong>
                <span className="muted">
                  {sealed
                    ? opensWords(t, envelope)
                    : t('Opened {when}', { when: formatWhen(envelope.openedAt ?? '', language) })}
                </span>
              </div>
              <p className="muted">{t('Inside: {title}', { title: envelope.title })}</p>
              {envelope.text !== null && <p className="envelope-inside">{envelope.text}</p>}
              {envelope.picture !== null && (
                <p className="muted">
                  {t('Picture: {name}', { name: envelope.picture.name ?? '—' })}
                </p>
              )}
              {asking === envelope.envelopeId ? (
                <div
                  className="action-row"
                  role="group"
                  aria-labelledby={`${ids}-ask-${envelope.envelopeId}`}
                >
                  <span id={`${ids}-ask-${envelope.envelopeId}`}>
                    {sealed
                      ? t(
                          'Delete this sealed envelope? It leaves the party’s Journal and never opens.',
                        )
                      : t('Remove it from this list? The party keeps the handout.')}
                  </span>
                  <button
                    type="button"
                    aria-disabled={busy}
                    onClick={() => {
                      act(envelope, 'delete');
                    }}
                  >
                    {t('Delete it')}
                  </button>
                  <button
                    ref={keep}
                    type="button"
                    onClick={() => {
                      setAsking(null);
                      requestAnimationFrame(() => rowOf(envelope.envelopeId)?.focus());
                    }}
                  >
                    {t('Keep it')}
                  </button>
                </div>
              ) : (
                <div className="action-row">
                  {sealed && (
                    <button
                      type="button"
                      className="primary-button"
                      aria-disabled={busy}
                      aria-label={t('Open it now: {label}', { label: envelope.label })}
                      onClick={() => {
                        act(envelope, 'open');
                      }}
                    >
                      {t('Open it now')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="quiet-button"
                    aria-label={
                      sealed
                        ? t('Delete the envelope: {label}', { label: envelope.label })
                        : t('Remove from the list: {label}', { label: envelope.label })
                    }
                    onClick={() => {
                      setFailed(null);
                      setAsking(envelope.envelopeId);
                    }}
                  >
                    {sealed ? t('Delete') : t('Remove from the list')}
                  </button>
                </div>
              )}
              {failed?.id === envelope.envelopeId && (
                <p role="alert" className="account-field-error">
                  {failed.word}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
