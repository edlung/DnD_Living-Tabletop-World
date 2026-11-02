import type { EntityPresentationResponse, EntityRef, HandoutView } from '@ltw/contracts';
import { HANDOUT_TEXT_MAX, HANDOUT_TITLE_MAX } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useDiceTable } from '../dice/table.tsx';
import { Field } from '../session/account-forms.tsx';
import { useApprovedImage } from '../visual/approved-images.ts';
import { Glyph } from '../visual/glyph.tsx';

/**
 * Handouts (docs/adr/0044-online-play.md §5): what the DM shows one player, or the party — a text,
 * a picture of something the recipient knows, or both. Players read theirs in the Journal (a new
 * one waits over the stage until opened); the DM gives them from the Party sheet.
 */
export const handoutElementId = (handoutId: string) => `handout-${handoutId}`;

function HandoutCard({ api, handout }: { readonly api: WorldApi; readonly handout: HandoutView }) {
  const t = useT();
  const ids = useId();
  const pictured = handout.picture?.entityId ?? null;
  const load = useCallback(
    (signal: AbortSignal) =>
      pictured === null
        ? Promise.resolve(null)
        : api.get<EntityPresentationResponse>(
            `entities/${encodeURIComponent(pictured)}/presentation`,
            signal,
          ),
    [api, pictured],
  );
  const shown = useResource(`handout-picture:${handout.handoutId}`, load);
  const art = useApprovedImage(
    shown.resource.status === 'ready' ? (shown.resource.value?.presentation.image ?? null) : null,
  );
  return (
    <article
      id={handoutElementId(handout.handoutId)}
      className="handout"
      tabIndex={-1}
      aria-labelledby={`${ids}-title`}
    >
      <h4 id={`${ids}-title`}>{handout.title}</h4>
      <p className="muted handout-for">
        {handout.to === 'party'
          ? t('For the party')
          : t('For {name}', { name: handout.to.name ?? t('someone') })}
      </p>
      {art && <img className="handout-picture" src={art} alt={handout.picture?.name ?? ''} />}
      {handout.text && <p className="handout-text">{handout.text}</p>}
    </article>
  );
}

/** The Journal's handouts, newest first. */
export function HandoutsSection({ api }: { readonly api: WorldApi }) {
  const t = useT();
  const table = useDiceTable();
  if (!table || table.handouts.length === 0) return null;
  return (
    <section className="sheet-section handouts" aria-labelledby="journal-handouts">
      <h3 id="journal-handouts">{t('Handouts')}</h3>
      <div className="handout-list">
        {[...table.handouts].reverse().map((handout) => (
          <HandoutCard key={handout.handoutId} api={api} handout={handout} />
        ))}
      </div>
    </section>
  );
}

/** The DM gives a handout: to the party or one player, a title, a text, a picture, or both. */
export function GiveHandout({
  characters,
  directory,
}: {
  readonly characters: readonly EntityRef[];
  /** What the DM may picture: the server keeps it to what the recipient knows. */
  readonly directory: readonly EntityRef[];
}) {
  const t = useT();
  const ids = useId();
  const table = useDiceTable();
  const [to, setTo] = useState('party');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [pictured, setPictured] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'given' | 'failed'>('idle');
  if (!table?.isDm) return null;
  const empty = text.trim() === '' && pictured === '';
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (title.trim() === '' || empty) return;
    setState('busy');
    void table
      .give({
        title: title.trim(),
        ...(text.trim() === '' ? {} : { text: text.trim() }),
        ...(pictured === '' ? {} : { entityId: pictured }),
        ...(to === 'party' ? {} : { recipientId: to }),
      })
      .then((done) => {
        setState(done ? 'given' : 'failed');
        if (!done) return;
        setTitle('');
        setText('');
        setPictured('');
        setAttempted(false);
      });
  };
  return (
    <section className="sheet-section give-handout" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Give a handout')}</h3>
      <form className="hand-form" noValidate onSubmit={submit}>
        <label htmlFor={`${ids}-to`}>{t('For')}</label>
        <select
          id={`${ids}-to`}
          value={to}
          onChange={(event) => {
            setTo(event.target.value);
          }}
        >
          <option value="party">{t('The party')}</option>
          {characters.map((character) => (
            <option key={character.entityId} value={character.entityId}>
              {character.name}
            </option>
          ))}
        </select>
        <Field
          label={t('Title')}
          error={attempted && title.trim() === '' ? t('Give it a title.') : null}
        >
          {(control) => (
            <input
              {...control}
              maxLength={HANDOUT_TITLE_MAX}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
            />
          )}
        </Field>
        <Field
          label={t('Text (optional)')}
          error={attempted && empty ? t('Write a text or choose a picture.') : null}
        >
          {(control) => (
            <textarea
              {...control}
              rows={3}
              maxLength={HANDOUT_TEXT_MAX}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
              }}
            />
          )}
        </Field>
        <label htmlFor={`${ids}-picture`}>{t('Picture (optional)')}</label>
        <select
          id={`${ids}-picture`}
          value={pictured}
          onChange={(event) => {
            setPictured(event.target.value);
          }}
        >
          <option value="">{t('No picture')}</option>
          {directory.map((entity) => (
            <option key={entity.entityId} value={entity.entityId}>
              {entity.name}
            </option>
          ))}
        </select>
        <div className="action-row">
          <button type="submit" className="primary-button" disabled={state === 'busy'}>
            <Glyph name="give" />
            {t('Give the handout')}
          </button>
        </div>
        <p role="status" className={state === 'failed' ? 'field-error' : 'muted'}>
          {state === 'given'
            ? t('Given.')
            : state === 'failed'
              ? t('It could not be given: the picture must be of something its reader knows.')
              : ''}
        </p>
      </form>
    </section>
  );
}
