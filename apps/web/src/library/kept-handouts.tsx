import type { EntityRef, KeptHandoutView } from '@ltw/contracts';
import { StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useDiceTable } from '../dice/table.tsx';
import { formatWhen } from '../dm/players.ts';
import { HandoutFields, draftHandout, type HandoutDraft } from '../handouts/handout-fields.tsx';
import { GiveHandout } from '../handouts/handouts.tsx';
import { useLibrary, type Library } from './use-library.ts';

/**
 * Handouts for the table (docs/adr/0058-campaign-content.md §3): the DM gives one now or keeps it
 * for later; a kept one waits in the library, changed or deleted at will and given — to the party
 * or one player — as often as the DM likes, never seen until then.
 */
export function TableHandouts({
  api,
  characters,
  directory,
}: {
  readonly api: WorldApi;
  readonly characters: readonly EntityRef[];
  readonly directory: readonly EntityRef[];
}) {
  const t = useT();
  const ids = useId();
  const table = useDiceTable();
  const library = useLibrary(api);
  if (!table?.isDm) return null;
  const kept = library.resource.status === 'ready' ? library.resource.value.handouts : null;
  return (
    <>
      <GiveHandout
        characters={characters}
        directory={directory}
        onKeep={(handout) => library.write(`dm/library/handouts/${crypto.randomUUID()}`, handout)}
      />
      <section className="sheet-section kept-handouts" aria-labelledby={`${ids}-title`}>
        <h3 id={`${ids}-title`}>{t('Kept for later')}</h3>
        {kept === null ? (
          <StatusPanel
            state={library.resource.status === 'error' ? 'error' : 'loading'}
            label={
              library.resource.status === 'error'
                ? library.resource.message
                : t('Reading your library…')
            }
            onRetry={library.retry}
          />
        ) : kept.length === 0 ? (
          <p className="muted">{t('A handout you keep waits here until you give it.')}</p>
        ) : (
          <ul className="notes kept-list">
            {kept.map((handout) => (
              <KeptHandoutCard
                key={handout.entryId}
                handout={handout}
                library={library}
                characters={characters}
                directory={directory}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function KeptHandoutCard({
  handout,
  library,
  characters,
  directory,
}: {
  readonly handout: KeptHandoutView;
  readonly library: Library;
  readonly characters: readonly EntityRef[];
  readonly directory: readonly EntityRef[];
}) {
  const t = useT();
  const language = useLanguage();
  const ids = useId();
  const table = useDiceTable();
  const [to, setTo] = useState('party');
  const [editing, setEditing] = useState<HandoutDraft | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [said, setSaid] = useState<'given' | 'refused' | 'unsaved' | null>(null);
  const path = `dm/library/handouts/${encodeURIComponent(handout.entryId)}`;
  const give = async () => {
    const given = (await table?.giveKept(handout.entryId, to === 'party' ? null : to)) ?? false;
    setSaid(given ? 'given' : 'refused');
    library.reread();
  };
  if (editing) {
    return (
      <li className="note kept-handout">
        <EditKept
          title={handout.title}
          draft={editing}
          directory={directory}
          busy={library.busy}
          onChange={setEditing}
          onCancel={() => {
            setEditing(null);
          }}
          onSave={async (body) => {
            const outcome = await library.write(path, body);
            setSaid(outcome === 'done' ? null : 'unsaved');
            if (outcome === 'done') setEditing(null);
          }}
        />
        {said === 'unsaved' && (
          <p role="alert" className="field-error">
            {t('The handout could not be saved. Try again.')}
          </p>
        )}
      </li>
    );
  }
  return (
    <li className="note kept-handout">
      <div className="section-heading">
        <strong>{handout.title}</strong>
        <span className="muted">
          {handout.givenAt === null
            ? t('Not given yet')
            : t('Given {when}', { when: formatWhen(handout.givenAt, language) })}
        </span>
      </div>
      {handout.text !== null && <p className="note-body kept-text">{handout.text}</p>}
      {handout.picture !== null && (
        <p className="muted kept-picture">
          {t('Picture: {name}', { name: handout.picture.name ?? '—' })}
        </p>
      )}
      <div className="kept-give">
        <div className="account-field">
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
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={table?.busy === true}
          aria-label={t('Give: {title}', { title: handout.title })}
          onClick={() => void give()}
        >
          {t('Give')}
        </button>
      </div>
      <p role="status" className={said === 'refused' ? 'field-error' : 'muted'}>
        {said === 'given'
          ? t('Given.')
          : said === 'refused'
            ? t('It could not be given: the picture must be of something its reader knows.')
            : ''}
      </p>
      <div className="action-row">
        <button
          type="button"
          aria-label={t('Change: {title}', { title: handout.title })}
          onClick={() => {
            setSaid(null);
            setEditing({
              title: handout.title,
              text: handout.text ?? '',
              pictured: handout.picture?.entityId ?? '',
            });
          }}
        >
          {t('Change')}
        </button>
        {deleting ? (
          <>
            <button
              type="button"
              disabled={library.busy}
              onClick={() => void library.write(`${path}/delete`, {})}
            >
              {t('Delete it')}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleting(false);
              }}
            >
              {t('Keep it')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="quiet-button"
            aria-label={t('Delete: {title}', { title: handout.title })}
            onClick={() => {
              setDeleting(true);
            }}
          >
            {t('Delete')}
          </button>
        )}
      </div>
    </li>
  );
}

function EditKept({
  title,
  draft,
  directory,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  readonly title: string;
  readonly draft: HandoutDraft;
  readonly directory: readonly EntityRef[];
  readonly busy: boolean;
  readonly onChange: (draft: HandoutDraft) => void;
  readonly onCancel: () => void;
  readonly onSave: (body: NonNullable<ReturnType<typeof draftHandout>>) => Promise<void>;
}) {
  const t = useT();
  const ids = useId();
  const [attempted, setAttempted] = useState(false);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    const body = draftHandout(draft);
    if (body !== null) void onSave(body);
  };
  return (
    <form className="hand-form" noValidate aria-labelledby={`${ids}-title`} onSubmit={submit}>
      <h4 id={`${ids}-title`}>{t('Change: {title}', { title })}</h4>
      <HandoutFields
        draft={draft}
        onChange={onChange}
        attempted={attempted}
        directory={directory}
      />
      <div className="action-row">
        <button type="submit" className="primary-button" disabled={busy}>
          {t('Save the changes')}
        </button>
        <button type="button" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}
