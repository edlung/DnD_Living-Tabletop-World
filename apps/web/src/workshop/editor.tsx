import { LanguageProvider, StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useCallback, useEffect, useState } from 'react';

import { useResource } from '../api/resource.ts';
import type { WorkshopClient } from './client.ts';
import { GenerationTab } from './generation/tab.tsx';
import { draftSchema, revisionHistorySchema, type RevisionHistory } from './response-schemas.ts';
import { ScenarioTab, type ScenarioSource, type ScenarioMode } from './scenario-tab.tsx';
import { useRequestSignal } from './use-request-signal.ts';
import { OwnerPreviewTab } from './preview/tab.tsx';
import { PreviewWorld } from './preview/world.tsx';
import { ActivationTab } from './activation/tab.tsx';

export function DraftEditor({
  client,
  draftId,
  onBack,
  onRestricted,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly onBack: () => void;
  readonly onRestricted: (restricted: boolean) => void;
}) {
  const [mode, setMode] = useState<
    | { kind: 'owner'; revision: number | null }
    | { kind: 'character'; revision: number; characterId: string }
  >({ kind: 'owner', revision: null });
  if (mode.kind === 'character')
    return (
      <section className="workshop-editor workshop-character-preview">
        <PreviewWorld
          key={`${mode.revision}:${mode.characterId}`}
          client={client}
          draftId={draftId}
          scope={{
            revision: mode.revision,
            perspective: 'CHARACTER',
            characterId: mode.characterId,
          }}
          onLeave={() => {
            onRestricted(false);
            setMode({ kind: 'owner', revision: mode.revision });
          }}
        />
      </section>
    );
  return (
    <OwnerDraftEditor
      client={client}
      draftId={draftId}
      onBack={onBack}
      initialPreviewRevision={mode.revision}
      onCharacter={(revision, characterId) => {
        onRestricted(true);
        setMode({ kind: 'character', revision, characterId });
      }}
    />
  );
}

function OwnerDraftEditor({
  client,
  draftId,
  onBack,
  initialPreviewRevision,
  onCharacter,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly onBack: () => void;
  readonly initialPreviewRevision: number | null;
  readonly onCharacter: (revision: number, characterId: string) => void;
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
            initialPreviewRevision={initialPreviewRevision}
            onCharacter={onCharacter}
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
  initialPreviewRevision,
  onCharacter,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly title: string;
  readonly history: RevisionHistory;
  readonly onRefresh: () => void;
  readonly onBack: () => void;
  readonly initialPreviewRevision: number | null;
  readonly onCharacter: (revision: number, characterId: string) => void;
}) {
  const t = useT();
  const language = useLanguage();
  const head = history.revisions[0]?.revision ?? 0;
  const [tab, setTab] = useState<'scenario' | 'generation' | 'visual' | 'activation'>(() =>
    initialPreviewRevision !== null ? 'visual' : head ? 'scenario' : 'generation',
  );
  const [source, setSource] = useState<ScenarioSource>({
    kind: 'revision',
    revision: initialPreviewRevision,
  });
  const [older, setOlder] = useState<RevisionHistory | null>(null);
  const [activationPending, setActivationPending] = useState(false);
  const [scenarioPending, setScenarioPending] = useState(false),
    [scenarioMode, setScenarioMode] = useState<ScenarioMode>('inspect');
  const [linkedEntity, setLinkedEntity] = useState<{ revision: number; entityId: string } | null>(
    null,
  );
  const [historyState, setHistoryState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const signal = useRequestSignal();
  const ownerPending = scenarioPending || activationPending;
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
  const inspect = (next: ScenarioSource, nextMode: ScenarioMode = 'inspect') => {
    setScenarioMode(nextMode);
    setSource(next);
    setTab('scenario');
    document.getElementById('workshop-tab-scenario')?.focus();
  };
  return (
    <>
      <header className="workshop-editor-heading">
        <button disabled={ownerPending} onClick={onBack}>
          {t('Back to the workshop')}
        </button>
        <div>
          <h2>{title}</h2>
          <p>
            {head
              ? t('Latest saved revision: {revision}', { revision: head })
              : t('No campaign content has been saved yet.')}
          </p>
        </div>
        <button disabled={ownerPending} onClick={onRefresh}>
          {t('Refresh revision history')}
        </button>
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
          disabled={activationPending}
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
          disabled={ownerPending}
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
        <button
          id="workshop-tab-visual"
          role="tab"
          aria-selected={tab === 'visual'}
          tabIndex={tab === 'visual' ? 0 : -1}
          aria-controls="workshop-editor-panel"
          disabled={head === 0 || ownerPending}
          onClick={() => {
            setTab('visual');
          }}
        >
          {t('World preview')}
        </button>
        <button
          id="workshop-tab-activation"
          role="tab"
          aria-selected={tab === 'activation'}
          tabIndex={tab === 'activation' ? 0 : -1}
          aria-controls="workshop-editor-panel"
          disabled={head === 0 || scenarioPending}
          onClick={() => {
            setTab('activation');
          }}
        >
          {t('Activation')}
        </button>
      </nav>
      {activationPending && (
        <p role="status">
          {t(
            'The activation answer is pending. Keep this page open to retry the exact confirmation.',
          )}
        </p>
      )}
      {scenarioPending && (
        <p role="status">
          {t('Save, retry or explicitly discard the pending edit before leaving this scenario.')}
        </p>
      )}
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
                disabled={ownerPending}
                value={source.kind === 'revision' ? (source.revision ?? 'latest') : source.kind}
                onChange={(event) => {
                  if (
                    ['candidate', 'step', 'review', 'compare', 'restore'].includes(
                      event.target.value,
                    )
                  )
                    return;
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
                {source.kind === 'review' && (
                  <option value="review">{t('AI edit proposal')}</option>
                )}
                {source.kind === 'compare' && (
                  <option value="compare">{t('Revision comparison')}</option>
                )}
                {source.kind === 'restore' && (
                  <option value="restore">{t('Restore preview')}</option>
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
              initialMode={scenarioMode}
              headRevision={head}
              revisions={revisions}
              onPendingChanged={setScenarioPending}
              onRefreshHistory={onRefresh}
              onInspectSource={inspect}
              {...(linkedEntity ? { initialEntityId: linkedEntity.entityId } : {})}
              onVisual={(revision, entityId) => {
                setLinkedEntity({ revision, entityId });
                setSource({ kind: 'revision', revision });
                setTab('visual');
                document.getElementById('workshop-tab-visual')?.focus();
              }}
              onSaved={(revision) => {
                setScenarioMode('inspect');
                setSource({ kind: 'revision', revision });
                onRefresh();
              }}
            />
          </>
        ) : tab === 'activation' ? (
          <ActivationTab
            client={client}
            draftId={draftId}
            revision={source.kind === 'revision' ? (source.revision ?? head) : head}
            headRevision={head}
            onPendingChanged={setActivationPending}
            onInspect={(revision) => {
              inspect({ kind: 'revision', revision });
            }}
            onRestore={(revision) => {
              inspect({ kind: 'restore', revision });
            }}
          />
        ) : tab === 'visual' ? (
          <OwnerPreviewTab
            key={source.kind === 'revision' ? (source.revision ?? head) : head}
            client={client}
            draftId={draftId}
            revision={source.kind === 'revision' ? (source.revision ?? head) : head}
            onCharacter={onCharacter}
            {...(linkedEntity ? { initialEntityId: linkedEntity.entityId } : {})}
            onScenario={(revision, entityId) => {
              setScenarioMode('inspect');
              setLinkedEntity({ revision, entityId });
              inspect({ kind: 'revision', revision });
            }}
            onManageProtections={(revision) => {
              inspect({ kind: 'revision', revision }, 'locks');
            }}
          />
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
