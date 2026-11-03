import type {
  EntityPresentationResponse,
  EntityRef,
  HandoutView,
  KeptHandout,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useDiceTable } from '../dice/table.tsx';
import { useApprovedImage } from '../visual/approved-images.ts';
import { Glyph } from '../visual/glyph.tsx';
import { EMPTY_DRAFT, HandoutFields, draftHandout, type HandoutDraft } from './handout-fields.tsx';

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

/** What keeping a handout came to: kept, refused at the library's limit, or lost. */
export type KeepOutcome = 'done' | 'full' | 'failed';

/**
 * The DM gives a handout: to the party or one player, a title, a text, a picture, or both — or
 * keeps it for later in the library (docs/adr/0058-campaign-content.md §3), when `onKeep` is given.
 */
export function GiveHandout({
  characters,
  directory,
  onKeep,
}: {
  readonly characters: readonly EntityRef[];
  /** What the DM may picture: the server keeps it to what the recipient knows. */
  readonly directory: readonly EntityRef[];
  readonly onKeep?: (handout: KeptHandout) => Promise<KeepOutcome>;
}) {
  const t = useT();
  const ids = useId();
  const table = useDiceTable();
  const [to, setTo] = useState('party');
  const [draft, setDraft] = useState<HandoutDraft>(EMPTY_DRAFT);
  const [attempted, setAttempted] = useState(false);
  const [state, setState] = useState<
    'idle' | 'busy' | 'given' | 'failed' | 'kept' | 'full' | 'unkept'
  >('idle');
  if (!table?.isDm) return null;
  const done = () => {
    setDraft(EMPTY_DRAFT);
    setAttempted(false);
  };
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    const handout = draftHandout(draft);
    if (handout === null) return;
    setState('busy');
    void table
      .give({ ...handout, ...(to === 'party' ? {} : { recipientId: to }) })
      .then((given) => {
        setState(given ? 'given' : 'failed');
        if (given) done();
      });
  };
  const keep = () => {
    setAttempted(true);
    const handout = draftHandout(draft);
    if (handout === null || !onKeep) return;
    setState('busy');
    void onKeep(handout).then((outcome) => {
      setState(outcome === 'done' ? 'kept' : outcome === 'full' ? 'full' : 'unkept');
      if (outcome === 'done') done();
    });
  };
  const said: Partial<Record<typeof state, string>> = {
    given: t('Given.'),
    failed: t('It could not be given: the picture must be of something its reader knows.'),
    kept: t('Kept for later: it waits below.'),
    full: t('Your library is full: delete a kept handout first.'),
    unkept: t('It could not be kept. Try again.'),
  };
  const wrong = state === 'failed' || state === 'full' || state === 'unkept';
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
        <HandoutFields
          draft={draft}
          onChange={setDraft}
          attempted={attempted}
          directory={directory}
        />
        <div className="action-row">
          <button type="submit" className="primary-button" disabled={state === 'busy'}>
            <Glyph name="give" />
            {t('Give the handout')}
          </button>
          {onKeep && (
            <button type="button" disabled={state === 'busy'} onClick={keep}>
              {t('Keep for later')}
            </button>
          )}
        </div>
        <p role="status" className={wrong ? 'field-error' : 'muted'}>
          {said[state] ?? ''}
        </p>
      </form>
    </section>
  );
}
