import type { CampaignPackage } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useResource } from '../api/resource.ts';
import type { WorkshopClient } from './client.ts';
import { generationViewSchema, revisionViewSchema } from './response-schemas.ts';
import { ScenarioBrowser } from './scenario/browser.tsx';

export type ScenarioSource =
  | { readonly kind: 'revision'; readonly revision: number | null }
  | { readonly kind: 'candidate'; readonly jobId: string }
  | { readonly kind: 'step'; readonly jobId: string; readonly ordinal: number };

/** A full owner package exists only inside this mounted scenario boundary. */
export function ScenarioTab({
  client,
  draftId,
  source,
  onSaved,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly source: ScenarioSource;
  readonly onSaved: (revision: number) => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'uncertain' | 'conflict'>('idle');
  const pending = useRef<{
    requestId: string;
    basedOnRevision: number;
    content: CampaignPackage;
  } | null>(null);
  const alive = useRef(true);
  const section = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const revision = source.kind === 'revision' ? source.revision : null;
  const jobId = source.kind === 'revision' ? null : source.jobId;
  const ordinal = source.kind === 'step' ? source.ordinal : null;
  const contextKey = `${source.kind}:${String(revision)}:${String(jobId)}:${String(ordinal)}`;
  const currentContext = useRef(contextKey);
  currentContext.current = contextKey;
  const writing = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    writing.current = controller;
    pending.current = null;
    setSaveState('idle');
    return () => {
      controller.abort();
    };
  }, [contextKey]);
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (jobId !== null) {
        const result = await client.request(
          `/drafts/${draftId}/generation/${jobId}`,
          generationViewSchema,
          { signal },
        );
        if (result.kind !== 'ready') throw new Error('WORKSHOP_READ_FAILED');
        if (ordinal !== null) {
          const step = result.value.steps.find((entry) => entry.ordinal === ordinal);
          if (step?.status !== 'SUCCEEDED' || !step.content)
            throw new Error('WORKSHOP_READ_FAILED');
          return { content: step.content, assessment: null, revision: null };
        }
        if (!result.value.candidate) throw new Error('WORKSHOP_READ_FAILED');
        return { content: result.value.candidate.content, assessment: null, revision: null };
      }
      const path = revision === null ? 'package' : `revisions/${String(revision)}`;
      const result = await client.request(`/drafts/${draftId}/${path}`, revisionViewSchema, {
        signal,
      });
      if (result.kind !== 'ready') throw new Error('WORKSHOP_READ_FAILED');
      return {
        content: result.value.revision?.content ?? null,
        assessment: result.value.assessment,
        revision: result.value.revision?.revision ?? null,
      };
    },
    [client, draftId, revision, jobId, ordinal],
  );
  const { resource, retry } = useResource(`scenario:${draftId}:${contextKey}`, load);
  useEffect(() => {
    if (resource.status !== 'ready' || !restoreFocus.current) return;
    restoreFocus.current = false;
    const target = section.current?.querySelector<HTMLElement>('.scenario-inspector-target');
    target?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 1099px)').matches)
      target?.scrollIntoView({ block: 'start' });
  }, [resource]);
  const save = async (
    content: CampaignPackage,
  ): Promise<'saved' | 'conflict' | 'uncertain' | 'failed'> => {
    if (resource.status !== 'ready' || resource.value.revision === null || jobId !== null)
      return 'failed';
    const payload = pending.current ?? {
      requestId: crypto.randomUUID(),
      basedOnRevision: resource.value.revision,
      content,
    };
    if (JSON.stringify(payload.content) !== JSON.stringify(content)) {
      setSaveState('uncertain');
      return 'uncertain';
    }
    pending.current = payload;
    setSaveState('saving');
    const startedIn = contextKey;
    const result = await client.request(`/drafts/${draftId}/revisions`, revisionViewSchema, {
      body: payload,
      ...(writing.current ? { signal: writing.current.signal } : {}),
    });
    if (!alive.current || currentContext.current !== startedIn) return 'failed';
    if (result.kind === 'conflict') {
      setSaveState('conflict');
      return 'conflict';
    }
    if (result.kind !== 'ready' || !result.value.revision) {
      setSaveState('uncertain');
      return 'uncertain';
    }
    pending.current = null;
    setSaveState('idle');
    restoreFocus.current = true;
    onSaved(result.value.revision.revision);
    return 'saved';
  };
  return (
    <section ref={section} className="workshop-scenario" aria-label={t('Scenario')}>
      <div className="workshop-section-heading">
        <h3>
          {ordinal !== null
            ? t('Saved preparation step')
            : jobId
              ? t('Unattached generation proposal')
              : t('Scenario overview')}
        </h3>
        <button
          onClick={() => {
            pending.current = null;
            setSaveState('idle');
            retry();
          }}
        >
          {t('Reload saved content')}
        </button>
      </div>
      {ordinal !== null ? (
        <p>
          {t(
            'This is unfinished preparation from one saved step. It has not passed the complete campaign checks.',
          )}
        </p>
      ) : (
        jobId && (
          <p>
            {t('This proposal is separate from saved revisions. It cannot change a played world.')}
          </p>
        )
      )}
      {(saveState === 'uncertain' || saveState === 'conflict') && (
        <div className="workshop-panel" role="status">
          <p>
            {saveState === 'uncertain'
              ? t('Your original correction is kept here, even when you inspect another object.')
              : t(
                  'Another revision was saved. Reload saved content before making a new correction.',
                )}
          </p>
          {saveState === 'uncertain' && (
            <button
              onClick={() => {
                if (pending.current) void save(pending.current.content);
              }}
            >
              {t('Retry original correction')}
            </button>
          )}
        </div>
      )}
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={
            resource.status === 'error'
              ? t('The scenario could not be read. Try again.')
              : t('Reading the scenario…')
          }
          onRetry={retry}
        />
      ) : resource.value.content === null ? (
        <p>{t('Generate a campaign to prepare its scenario.')}</p>
      ) : (
        <ScenarioBrowser
          content={resource.value.content}
          assessment={resource.value.assessment}
          selectedPath={selected}
          onSelect={setSelected}
          {...(jobId === null ? { onSave: save } : {})}
        />
      )}
    </section>
  );
}
