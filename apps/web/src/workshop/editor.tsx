import { LanguageProvider, StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useCallback, useEffect, useState } from 'react';

import { useResource } from '../api/resource.ts';
import type { WorkshopClient } from './client.ts';
import { GenerationTab } from './generation/tab.tsx';
import { draftSchema, revisionHistorySchema, type RevisionHistory } from './response-schemas.ts';
import { ScenarioTab, type ScenarioSource } from './scenario-tab.tsx';
import { useRequestSignal } from './use-request-signal.ts';

export function DraftEditor({
  client,
  draftId,
  onBack,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly onBack: () => void;
}) {
  const t = useT();
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [draft, history] = await Promise.all([
        client.request(`/drafts/${draftId}`, draftSchema, { signal }),
        client.request(`/drafts/${draftId}/revisions`, revisionHistorySchema, { signal }),
      ]);
      if (draft.kind !== 'ready' || history.kind !== 'ready')
        throw new Error('WORKSHOP_READ_FAILED');
      return { draft: draft.value, history: history.value };
    },
    [client, draftId],
  );
  const { resource, retry, reread } = useResource(`editor:${draftId}`, load);
  return (
    <section className="workshop-editor">
      {resource.status !== 'ready' && <button onClick={onBack}>{t('Back to the workshop')}</button>}
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={
            resource.status === 'error'
              ? t('The draft could not be read. Try again.')
              : t('Reading the draft…')
          }
          onRetry={retry}
        />
      ) : (
        <LanguageProvider language={resource.value.draft.language}>
          <EditorContent
            client={client}
            draftId={draftId}
            title={resource.value.draft.title}
            history={resource.value.history}
            onRefresh={reread}
            onBack={onBack}
          />
        </LanguageProvider>
      )}
    </section>
  );
}

function EditorContent({
  client,
  draftId,
  title,
  history,
  onRefresh,
  onBack,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly title: string;
  readonly history: RevisionHistory;
  readonly onRefresh: () => void;
  readonly onBack: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const head = history.revisions[0]?.revision ?? 0;
  const [tab, setTab] = useState<'scenario' | 'generation'>(() =>
    head ? 'scenario' : 'generation',
  );
  const [source, setSource] = useState<ScenarioSource>({ kind: 'revision', revision: null });
  const [older, setOlder] = useState<RevisionHistory | null>(null);
  const [historyState, setHistoryState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const signal = useRequestSignal();
  useEffect(() => {
    const previousTitle = document.title;
    const previousLanguage = document.documentElement.lang;
    document.title = t('{title} · Campaign workshop', { title });
    document.documentElement.lang = language;
    return () => {
      document.title = previousTitle;
      document.documentElement.lang = previousLanguage;
    };
  }, [title, language]);
  const revisions = [...history.revisions, ...(older?.revisions ?? [])].filter(
    (entry, index, all) => all.findIndex((other) => other.revision === entry.revision) === index,
  );
  const before = older ? older.nextBefore : history.nextBefore;
  const more = async () => {
    if (before === null || historyState === 'loading') return;
    setHistoryState('loading');
    const result = await client.request(
      `/drafts/${draftId}/revisions?before=${String(before)}`,
      revisionHistorySchema,
      { signal: signal() },
    );
    if (result.kind === 'cancelled' || result.kind === 'signed-out') return;
    setHistoryState(result.kind === 'ready' ? 'idle' : 'failed');
    if (result.kind === 'ready')
      setOlder({
        revisions: [...(older?.revisions ?? []), ...result.value.revisions],
        nextBefore: result.value.nextBefore,
      });
  };
  const inspect = (next: ScenarioSource) => {
    setSource(next);
    setTab('scenario');
    document.getElementById('workshop-tab-scenario')?.focus();
  };
  return (
    <>
      <header className="workshop-editor-heading">
        <button onClick={onBack}>{t('Back to the workshop')}</button>
        <div>
          <h2>{title}</h2>
          <p>
            {head
              ? t('Latest saved revision: {revision}', { revision: head })
              : t('No campaign content has been saved yet.')}
          </p>
        </div>
        <button onClick={onRefresh}>{t('Refresh revision history')}</button>
      </header>
      <nav
        className="workshop-tabs"
        role="tablist"
        aria-label={t('Draft sections')}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          const tabs = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
          ).filter((button) => !button.disabled);
          const focused =
            event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
          const from = tabs.findIndex((button) => button === focused);
          if (from < 0) return;
          event.preventDefault();
          const nextIndex =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? tabs.length - 1
                : (from + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          tabs[nextIndex]?.click();
          tabs[nextIndex]?.focus();
        }}
      >
        <button
          id="workshop-tab-scenario"
          role="tab"
          aria-selected={tab === 'scenario'}
          tabIndex={tab === 'scenario' ? 0 : -1}
          aria-controls="workshop-editor-panel"
          onClick={() => {
            setTab('scenario');
          }}
        >
          {t('Scenario')}
        </button>
        <button
          id="workshop-tab-generation"
          role="tab"
          aria-selected={tab === 'generation'}
          tabIndex={tab === 'generation' ? 0 : -1}
          aria-controls="workshop-editor-panel"
          onClick={() => {
            setTab('generation');
          }}
        >
          {t('Generation')}
        </button>
      </nav>
      <div
        id="workshop-editor-panel"
        role="tabpanel"
        aria-labelledby={`workshop-tab-${tab}`}
        tabIndex={0}
      >
        {tab === 'scenario' ? (
          <>
            <div className="workshop-revisions">
              <label htmlFor="workshop-revision">{t('Saved revision')}</label>
              <select
                id="workshop-revision"
                value={source.kind === 'revision' ? (source.revision ?? 'latest') : source.kind}
                onChange={(event) => {
                  if (['candidate', 'step'].includes(event.target.value)) return;
                  setSource({
                    kind: 'revision',
                    revision: event.target.value === 'latest' ? null : Number(event.target.value),
                  });
                }}
              >
                <option value="latest">{t('Latest saved content')}</option>
                {source.kind === 'candidate' && (
                  <option value="candidate">{t('Unattached generation proposal')}</option>
                )}
                {source.kind === 'step' && (
                  <option value="step">{t('Saved preparation step')}</option>
                )}
                {revisions.map((revision) => (
                  <option key={revision.revision} value={revision.revision}>
                    {t('Revision {revision}', { revision: revision.revision })}
                    {' · '}
                    {new Intl.DateTimeFormat(language, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(revision.createdAt))}
                  </option>
                ))}
              </select>
              {before !== null && (
                <button
                  disabled={historyState === 'loading'}
                  onClick={() => {
                    void more();
                  }}
                >
                  {t('Older revisions')}
                </button>
              )}
              {historyState === 'failed' && (
                <p role="alert">{t('The revision history could not be read.')}</p>
              )}
            </div>
            <ScenarioTab
              key={source.kind}
              client={client}
              draftId={draftId}
              source={source}
              onSaved={(revision) => {
                setSource({ kind: 'revision', revision });
                onRefresh();
              }}
            />
          </>
        ) : (
          <GenerationTab
            client={client}
            draftId={draftId}
            headRevision={head}
            onRevisionChanged={onRefresh}
            onInspectCandidate={(jobId) => {
              inspect({ kind: 'candidate', jobId });
            }}
            onInspectRevision={(revision) => {
              inspect({ kind: 'revision', revision });
            }}
            onInspectStep={(jobId, ordinal) => {
              inspect({ kind: 'step', jobId, ordinal });
            }}
          />
        )}
      </div>
    </>
  );
}
