import {
  NOTE_BODY_CHARS,
  NOTE_TITLE_CHARS,
  type PlayerNoteView,
  type PlayerNotesResponse,
} from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useCallback, useId, useRef, useState } from 'react';

import type { WorldApi } from '../../api/client.ts';
import { useResource } from '../../api/resource.ts';

const wait = () => AbortSignal.timeout(20_000);

/**
 * A player's private notes (docs/adr/0073-table-ideas.md §5): theirs alone — the DM does not read
 * them, nor any other player — written as the character they play. The page says so first. A
 * note is written, changed and deleted for good; nothing here reaches the world or the table.
 */
export function MyNotes({ api }: { readonly api: WorldApi }) {
  const t = useT();
  const language = useLanguage();
  const ids = useId();
  const load = useCallback(
    (signal: AbortSignal) => api.get<PlayerNotesResponse>('notes', signal),
    [api],
  );
  const { resource, reread } = useResource('my-notes', load);
  // The note being written: a new one (its ID made here, so a retry is the same note) or one
  // opened to change.
  const [editing, setEditing] = useState<{
    readonly noteId: string;
    readonly fresh: boolean;
    readonly title: string;
    readonly body: string;
  } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'failed' | 'full'>('idle');
  const [said, setSaid] = useState('');
  const opener = useRef<HTMLButtonElement>(null);
  const notes = resource.status === 'ready' ? resource.value.notes : [];
  const room = resource.status === 'ready' ? resource.value.room : false;
  const when = new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
    day: 'numeric',
    month: 'long',
  });
  const done = (word: string) => {
    setEditing(null);
    setAsking(null);
    setState('idle');
    setSaid(word);
    reread();
    requestAnimationFrame(() => opener.current?.focus());
  };
  const save = () => {
    if (editing === null || state === 'busy') return;
    if (editing.title.trim() === '' && editing.body.trim() === '') return;
    setState('busy');
    void api
      .post<{ error?: unknown } | undefined>(
        'notes',
        { noteId: editing.noteId, title: editing.title, body: editing.body },
        wait(),
        true,
      )
      .then(
        () => {
          done(t('The note is saved.'));
        },
        (error: unknown) => {
          // No room for one more: the server's 409.
          setState((error as { status?: number }).status === 409 ? 'full' : 'failed');
        },
      );
  };
  const remove = (note: PlayerNoteView) => {
    setState('busy');
    void api.post(`notes/${encodeURIComponent(note.noteId)}/delete`, {}, wait(), true).then(
      () => {
        done(t('The note is deleted.'));
      },
      () => {
        setState('failed');
      },
    );
  };
  return (
    <section className="hero-section story-section" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('My notes')}</h3>
      <p className="story-who">
        {t('Only you read these: not the DM, not the other players.')}
      </p>
      {resource.status === 'error' && (
        <p role="alert" className="authoring-notice error">
          {t('Your notes could not be read. Close the sheet and open it again.')}
        </p>
      )}
      <p role="status" className="story-status">
        {said}
      </p>
      {editing === null ? (
        <div className="action-row">
          <button
            ref={opener}
            type="button"
            disabled={resource.status !== 'ready' || !room}
            onClick={() => {
              setSaid('');
              setState('idle');
              setEditing({ noteId: crypto.randomUUID(), fresh: true, title: '', body: '' });
            }}
          >
            {t('Write a note')}
          </button>
          {resource.status === 'ready' && !room && (
            <p className="muted">{t('The notebook is full: delete a note to write another.')}</p>
          )}
        </div>
      ) : (
        <form
          className="hand-form"
          noValidate
          aria-label={editing.fresh ? t('A new note') : t('Change the note')}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label htmlFor={`${ids}-note-title`}>{t('What it is about (optional)')}</label>
          <input
            id={`${ids}-note-title`}
            type="text"
            maxLength={NOTE_TITLE_CHARS}
            value={editing.title}
            autoComplete="off"
            onChange={(event) => {
              setEditing({ ...editing, title: event.target.value });
            }}
          />
          <label htmlFor={`${ids}-note-body`}>{t('The note')}</label>
          <textarea
            id={`${ids}-note-body`}
            rows={5}
            maxLength={NOTE_BODY_CHARS}
            value={editing.body}
            onChange={(event) => {
              setEditing({ ...editing, body: event.target.value });
            }}
          />
          <div className="action-row">
            <button
              type="submit"
              className="primary-button"
              aria-disabled={
                state === 'busy' || (editing.title.trim() === '' && editing.body.trim() === '')
              }
            >
              {t('Save the note')}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setState('idle');
                requestAnimationFrame(() => opener.current?.focus());
              }}
            >
              {t('Cancel')}
            </button>
          </div>
          {state === 'failed' && (
            <p role="alert" className="authoring-notice error">
              {t('That was not saved. Try again.')}
            </p>
          )}
          {state === 'full' && (
            <p role="alert" className="authoring-notice error">
              {t('The notebook is full: delete a note to write another.')}
            </p>
          )}
        </form>
      )}
      {notes.length > 0 && (
        <ul className="story-notes">
          {notes.map((note) => (
            <li key={note.noteId}>
              <h4>{note.title === '' ? t('A note') : note.title}</h4>
              {note.body !== '' && <p className="story-note-body">{note.body}</p>}
              <p className="muted">
                {t('Changed {day}', { day: when.format(new Date(note.updatedAt)) })}
              </p>
              {asking === note.noteId ? (
                <div className="action-row" role="group" aria-label={t('Delete this note?')}>
                  <span>{t('Delete this note for good?')}</span>
                  <button
                    type="button"
                    aria-disabled={state === 'busy'}
                    onClick={() => {
                      if (state !== 'busy') remove(note);
                    }}
                  >
                    {t('Yes, delete it')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAsking(null);
                    }}
                  >
                    {t('Keep it')}
                  </button>
                </div>
              ) : (
                <div className="action-row">
                  <button
                    type="button"
                    disabled={editing !== null}
                    onClick={() => {
                      setSaid('');
                      setState('idle');
                      setEditing({ noteId: note.noteId, fresh: false, ...note });
                    }}
                  >
                    {t('Change')}
                  </button>
                  <button
                    type="button"
                    disabled={editing !== null}
                    onClick={() => {
                      setAsking(note.noteId);
                    }}
                  >
                    {t('Delete')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {resource.status === 'ready' && notes.length === 0 && editing === null && (
        <p className="muted">{t('No notes yet: a clue, a name to remember, a plan.')}</p>
      )}
    </section>
  );
}
