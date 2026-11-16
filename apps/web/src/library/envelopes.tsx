import {
  ENVELOPE_LABEL_MAX,
  type DmEnvelopeView,
  type DmEnvelopesResponse,
  type EnvelopeOpens,
} from '@ltw/contracts';
import { useLanguage, useT, type Translate } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

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
 * "Seal in an envelope" on a kept handout (docs/adr/0073-table-ideas.md §9): what the outside says
 * — all the party reads until it opens — and what opens it: the DM's word, or the writing of the
 * evening's chapter. The handout stays in the library; the envelope takes a copy of it.
 */
export function SealEnvelope({
  api,
  entryId,
  title,
  onSealed,
}: {
  readonly api: WorldApi;
  readonly entryId: string;
  readonly title: string;
  readonly onSealed: () => void;
}) {
  const t = useT();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [opens, setOpens] = useState<EnvelopeOpens>('word');
  const [state, setState] = useState<'idle' | 'busy' | 'empty' | 'full' | 'failed' | 'sealed'>(
    'idle',
  );
  // The envelope's ID is made once a form: a retried request seals one envelope.
  const [envelopeId, setEnvelopeId] = useState(() => crypto.randomUUID());
  const seal = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state === 'busy') return;
    if (label.trim() === '') {
      setState('empty');
      return;
    }
    setState('busy');
    void api
      .post(`dm/envelopes/${envelopeId}`, { entryId, label: label.trim(), opens }, wait())
      .then(
        () => {
          setState('sealed');
          setOpen(false);
          setLabel('');
          setEnvelopeId(crypto.randomUUID());
          onSealed();
        },
        (failure: unknown) => {
          setState(failure instanceof ApiError && failure.status === 409 ? 'full' : 'failed');
        },
      );
  };
  if (!open) {
    return (
      <>
        <button
          type="button"
          aria-label={t('Seal in an envelope: {title}', { title })}
          onClick={() => {
            setState('idle');
            setOpen(true);
          }}
        >
          {t('Seal in an envelope')}
        </button>
        <span role="status" className="muted">
          {state === 'sealed' ? t('Sealed: the party sees the envelope, not what is inside.') : ''}
        </span>
      </>
    );
  }
  return (
    <form className="hand-form envelope-form" noValidate aria-labelledby={`${ids}-title`} onSubmit={seal}>
      <h4 id={`${ids}-title`}>{t('Seal in an envelope: {title}', { title })}</h4>
      <div className="account-field">
        <label htmlFor={`${ids}-label`}>{t('What the outside says')}</label>
        <input
          id={`${ids}-label`}
          value={label}
          maxLength={ENVELOPE_LABEL_MAX}
          aria-describedby={`${ids}-hint`}
          aria-invalid={state === 'empty'}
          autoComplete="off"
          onChange={(event) => {
            setLabel(event.target.value);
            if (state === 'empty') setState('idle');
          }}
        />
        <p id={`${ids}-hint`} className="field-hint">
          {t('The party reads this while it is sealed — “Open after the battle”, “For the bravest”. Nothing of the inside shows.')}
        </p>
        {state === 'empty' && (
          <p role="alert" className="field-error">
            {t('Write what the outside says.')}
          </p>
        )}
      </div>
      <div className="account-field">
        <label htmlFor={`${ids}-opens`}>{t('It opens')}</label>
        <select
          id={`${ids}-opens`}
          value={opens}
          onChange={(event) => {
            setOpens(event.target.value === 'chapter' ? 'chapter' : 'word');
          }}
        >
          <option value="word">{t('When I open it')}</option>
          <option value="chapter">{t('By itself, when this evening’s chapter is written')}</option>
        </select>
      </div>
      {state === 'full' && (
        <p role="alert" className="field-error">
          {t('There are as many envelopes as a campaign holds: delete an opened one first.')}
        </p>
      )}
      {state === 'failed' && (
        <p role="alert" className="field-error">
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
            setOpen(false);
            setState('idle');
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
 * what is inside, what opens it — with "Open it now" and "Delete"; then those opened. Shown only
 * while there is one.
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
  const [said, setSaid] = useState<{ readonly id: string; readonly word: string } | null>(null);
  if (envelopes.length === 0) return null;
  const act = (envelope: DmEnvelopeView, what: 'open' | 'delete') => {
    if (busy) return;
    setBusy(true);
    setSaid(null);
    void api
      .post(`dm/envelopes/${envelope.envelopeId}/${what}`, {}, wait())
      .then(
        () => {
          setSaid({
            id: envelope.envelopeId,
            word: what === 'open' ? t('Opened: the party has it as a handout.') : '',
          });
        },
        (failure: unknown) => {
          setSaid({
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
      <h3 id={`${ids}-title`}>{t('Envelopes')}</h3>
      <ul className="notes kept-list">
        {envelopes.map((envelope) => (
          <li key={envelope.envelopeId} className="note envelope-card">
            <div className="section-heading">
              <strong>
                <Glyph name="secret" />
                {envelope.label}
              </strong>
              <span className="muted">
                {envelope.openedAt === null
                  ? opensWords(t, envelope)
                  : t('Opened {when}', { when: formatWhen(envelope.openedAt, language) })}
              </span>
            </div>
            <p className="muted">{t('Inside: {title}', { title: envelope.title })}</p>
            <div className="action-row">
              {envelope.openedAt === null && (
                <button
                  type="button"
                  className="primary-button"
                  aria-disabled={busy}
                  aria-label={t('Open now: {label}', { label: envelope.label })}
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
                aria-disabled={busy}
                aria-label={t('Delete the envelope: {label}', { label: envelope.label })}
                onClick={() => {
                  act(envelope, 'delete');
                }}
              >
                {t('Delete')}
              </button>
            </div>
            <p role="status" className="muted">
              {said?.id === envelope.envelopeId ? said.word : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
