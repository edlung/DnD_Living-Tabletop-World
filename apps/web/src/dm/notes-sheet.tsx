import type { DmNoteView, DmNotesResponse } from '@ltw/contracts';
import { StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import { formatWhen } from './players.ts';

/**
 * The DM's notes (docs/adr/0043-dm-screen.md §5): titled notes beside the world, the DM's only,
 * written, changed and deleted here; newest change first. Never part of the world.
 */
type Editing = { readonly noteId: string | null; readonly title: string; readonly body: string };

export function NotesSheet({ api, open }: { readonly api: WorldApi; readonly open: boolean }) {
  const t = useT();
  const language = useLanguage();
  const ids = useId();
  const [round, setRound] = useState(0);
  const load = useCallback(
    (signal: AbortSignal) => api.get<DmNotesResponse>('dm/notes', signal, false),
    [api],
  );
  const notes = useResource('dm-notes', load);
  useRereadOn(round, notes.reread);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const write = async (path: string, body: unknown) => {
    setBusy(true);
    setFailed(false);
    try {
      await api.post(path, body, AbortSignal.timeout(20_000));
      setEditing(null);
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
      setRound((value) => value + 1);
    }
  };
  const list = notes.resource.status === 'ready' ? notes.resource.value.notes : null;
  return (
    <div className="notes-sheet">
      <section className="notes-list" aria-labelledby={`${ids}-title`}>
        <div className="section-heading">
          <h3 id={`${ids}-title`}>
            <Glyph name="journal" />
            {t('Your notes')}
          </h3>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => {
              setEditing({ noteId: null, title: '', body: '' });
            }}
          >
            <Glyph name="add-character" />
            {t('New note')}
          </button>
        </div>
        <p className="muted">{t('Only you see these. They are not part of the world.')}</p>
        {list === null ? (
          <StatusPanel
            state={notes.resource.status === 'error' ? 'error' : 'loading'}
            label={
              notes.resource.status === 'error' ? notes.resource.message : t('Reading your notes…')
            }
            onRetry={notes.retry}
          />
        ) : list.length === 0 ? (
          <p className="muted">{t('No notes yet.')}</p>
        ) : (
          <ul className="notes">
            {list.map((note: DmNoteView) => (
              <li key={note.noteId} className="note">
                <div className="section-heading">
                  <strong>{note.title}</strong>
                  <span className="muted">{formatWhen(note.updatedAt, language)}</span>
                </div>
                {note.body !== '' && <p className="note-body">{note.body}</p>}
                <div className="action-row">
                  <button
                    type="button"
                    aria-label={t('Edit: {title}', { title: note.title })}
                    onClick={() => {
                      setEditing({ noteId: note.noteId, title: note.title, body: note.body });
                    }}
                  >
                    {t('Edit')}
                  </button>
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={busy}
                    aria-label={t('Delete: {title}', { title: note.title })}
                    onClick={() => void write(`dm/notes/${note.noteId}/delete`, {})}
                  >
                    {t('Delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {editing && (
        <NoteEditor
          key={editing.noteId ?? 'new'}
          editing={editing}
          busy={busy}
          onSave={(title, body) =>
            write(editing.noteId === null ? 'dm/notes' : `dm/notes/${editing.noteId}`, {
              title,
              body,
            })
          }
          onCancel={() => {
            setEditing(null);
          }}
        />
      )}
      {failed && (
        <p role="alert" className="authoring-notice error">
          {t('The note could not be saved. Try again.')}
        </p>
      )}
    </div>
  );
}

function NoteEditor({
  editing,
  busy,
  onSave,
  onCancel,
}: {
  readonly editing: Editing;
  readonly busy: boolean;
  readonly onSave: (title: string, body: string) => Promise<boolean>;
  readonly onCancel: () => void;
}) {
  const t = useT();
  const ids = useId();
  const [title, setTitle] = useState(editing.title);
  const [body, setBody] = useState(editing.body);
  const [attempted, setAttempted] = useState(false);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (title.trim() === '') return;
    void onSave(title.trim(), body);
  };
  return (
    <section className="note-editor" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{editing.noteId === null ? t('New note') : t('Edit the note')}</h3>
      <form className="hand-form" noValidate onSubmit={submit}>
        <Field
          label={t('Title')}
          error={attempted && title.trim() === '' ? t('Give it a title.') : null}
        >
          {(control) => (
            <input
              {...control}
              maxLength={120}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label={t('Note')}>
          {(control) => (
            <textarea
              {...control}
              rows={8}
              maxLength={8000}
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
              }}
            />
          )}
        </Field>
        <div className="action-row">
          <button type="submit" className="primary-button" disabled={busy}>
            {t('Save the note')}
          </button>
          <button type="button" onClick={onCancel}>
            {t('Cancel')}
          </button>
        </div>
      </form>
    </section>
  );
}
