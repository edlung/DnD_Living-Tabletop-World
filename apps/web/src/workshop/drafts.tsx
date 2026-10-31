import type { CreateWorkshopDraft, Language, WorkshopDraftView } from '@ltw/contracts';
import { StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react';

import { createWorkshopDraft, readWorkshopDrafts } from './transport.ts';
import { workshopDraftPath } from './route.ts';

export function WorkshopDrafts({
  ownerId,
  onEnded,
  onOpen,
}: {
  readonly ownerId: string;
  readonly onEnded: () => void;
  readonly onOpen: (draftId: string) => void;
}) {
  const t = useT();
  const language = useLanguage();
  const [drafts, setDrafts] = useState<readonly WorkshopDraftView[] | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const reading = useRef<{ generation: number; controller: AbortController | null }>({
    generation: 0,
    controller: null,
  });
  const load = useCallback(
    async (cursor: string | null = null) => {
      reading.current.controller?.abort();
      const controller = new AbortController();
      const generation = ++reading.current.generation;
      reading.current.controller = controller;
      setLoading(true);
      const result = await readWorkshopDrafts(ownerId, cursor, controller.signal);
      if (controller.signal.aborted || generation !== reading.current.generation) return;
      setLoading(false);
      setFailed(result.kind === 'failed');
      if (result.kind === 'signed-out') onEnded();
      if (result.kind === 'ready') {
        setDrafts((previous) =>
          cursor ? [...(previous ?? []), ...result.value.drafts] : result.value.drafts,
        );
        setAfter(result.value.nextCursor);
      }
    },
    [ownerId, onEnded],
  );
  useEffect(() => {
    void load();
    return () => reading.current.controller?.abort();
  }, [load]);
  return (
    <div className="workshop-columns">
      <section className="workshop-panel" aria-labelledby="new-draft-title">
        <h2 id="new-draft-title">{t('Start a campaign draft')}</h2>
        <p>{t('Give your idea a name and choose the language of your campaign.')}</p>
        <DraftForm
          ownerId={ownerId}
          onSaved={() => {
            void load();
          }}
          onEnded={onEnded}
        />
      </section>
      <section className="workshop-panel" aria-labelledby="draft-list-title">
        <div className="workshop-section-heading">
          <h2 id="draft-list-title">{t('Your drafts')}</h2>
          <button
            disabled={loading}
            onClick={() => {
              void load();
            }}
          >
            {t('Refresh drafts')}
          </button>
        </div>
        {drafts === null && !failed && (
          <StatusPanel state="loading" label={t('Reading your drafts…')} />
        )}
        {failed && <p role="alert">{t('The drafts could not be read. Try again.')}</p>}
        {drafts?.length === 0 && <p>{t('Your first campaign starts with a draft.')}</p>}
        {drafts && drafts.length > 0 && (
          <ul className="workshop-draft-list">
            {drafts.map((draft) => (
              <li key={draft.draftId}>
                <h3 aria-label={draft.title}>
                  <a
                    href={workshopDraftPath(draft.draftId)}
                    aria-label={t('Open draft: {title}', { title: draft.title })}
                    onClick={(event) => {
                      if (
                        event.button !== 0 ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return;
                      event.preventDefault();
                      onOpen(draft.draftId);
                    }}
                  >
                    {draft.title}
                  </a>
                </h3>
                <p>
                  {draft.language === 'ru' ? t('Russian') : t('English')}
                  {' · '}
                  <time dateTime={draft.createdAt}>
                    {new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(
                      new Date(draft.createdAt),
                    )}
                  </time>
                </p>
              </li>
            ))}
          </ul>
        )}
        {after && (
          <button
            disabled={loading}
            onClick={() => {
              void load(after);
            }}
          >
            {t('More drafts')}
          </button>
        )}
      </section>
    </div>
  );
}

function DraftForm({
  ownerId,
  onSaved,
  onEnded,
}: {
  readonly ownerId: string;
  readonly onSaved: () => void;
  readonly onEnded: () => void;
}) {
  const t = useT();
  const pageLanguage = useLanguage();
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<Language>(pageLanguage);
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed' | 'saved'>('idle');
  const pending = useRef<CreateWorkshopDraft | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'saving' || !title.trim()) return;
    const input = pending.current ?? {
      requestId: crypto.randomUUID(),
      title: title.trim(),
      language,
    };
    pending.current = input;
    setStatus('saving');
    const result = await createWorkshopDraft(ownerId, input);
    if (!alive.current) return;
    if (result === 'signed-out') {
      onEnded();
      return;
    }
    setStatus(result === 'saved' ? 'saved' : 'failed');
    if (result === 'saved') {
      pending.current = null;
      setTitle('');
      onSaved();
    }
  };
  return (
    <form
      className="workshop-draft-form"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <label htmlFor="workshop-draft-title">{t('Campaign title')}</label>
      <input
        id="workshop-draft-title"
        name="title"
        required
        maxLength={120}
        value={title}
        disabled={status === 'saving' || status === 'failed'}
        onChange={(event) => {
          setTitle(event.target.value);
          setStatus('idle');
        }}
      />
      <label htmlFor="workshop-draft-language">{t('Campaign language')}</label>
      <select
        id="workshop-draft-language"
        value={language}
        disabled={status === 'saving' || status === 'failed'}
        onChange={(event) => {
          setLanguage(event.target.value === 'ru' ? 'ru' : 'en');
          setStatus('idle');
        }}
      >
        <option value="ru">{t('Russian')}</option>
        <option value="en">{t('English')}</option>
      </select>
      <button
        className="primary-button"
        disabled={status === 'saving' || !title.trim()}
        type="submit"
      >
        {status === 'saving'
          ? t('Saving draft…')
          : status === 'failed'
            ? t('Retry saving draft')
            : t('Create draft')}
      </button>
      <div aria-live="polite">
        {status === 'saved' && <p>{t('Your draft is saved in this workshop.')}</p>}
        {status === 'failed' && (
          <p>{t('The answer could not be confirmed. Retry to save the same draft.')}</p>
        )}
      </div>
    </form>
  );
}
