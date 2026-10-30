import { campaignPackageSchema } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import type { WorkshopClient } from './client.ts';
import { RevisionReview, type ReviewSource } from './comparison/review.tsx';
import { CampaignChanges } from './comparison/changes.tsx';
import { CampaignAiEdit, type AiEditDraft } from './editing/ai-edit.tsx';
import { EditConflict } from './editing/conflicts.tsx';
import { CampaignManualEditor } from './editing/editor.tsx';
import { CampaignLocks } from './editing/locks.tsx';
import { contentPathLocked, targetForNode } from './editing/targets.ts';
import { useScenarioSave, type ManualDraftBuffer } from './editing/use-scenario-save.ts';
import { ScenarioBrowser } from './scenario/browser.tsx';
import { buildScenarioIndex, nearestScenarioPath } from './scenario/graph.ts';
import {
  readScenarioKey,
  useScenarioResource,
  type ReadScenarioSource,
} from './scenario-resource.ts';

export type ScenarioSource = ReadScenarioSource | ReviewSource;
export type ScenarioMode = 'inspect' | 'edit' | 'ai' | 'locks';
interface ScenarioProps {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly source: ScenarioSource;
  readonly onSaved: (revision: number) => void;
  readonly onInspectSource: (source: ScenarioSource) => void;
  readonly headRevision: number;
  readonly revisions: readonly { revision: number }[];
  readonly initialMode?: ScenarioMode;
  readonly initialEntityId?: string;
  readonly onPendingChanged: (pending: boolean) => void;
  readonly onRefreshHistory: () => void;
  readonly onVisual?: (revision: number, entityId: string) => void;
}

/** Every package, buffer and comparison lives inside this mounted owner boundary. */
export function ScenarioTab(props: ScenarioProps) {
  const { source } = props;
  if (source.kind === 'review' || source.kind === 'compare' || source.kind === 'restore')
    return (
      <RevisionReview
        client={props.client}
        draftId={props.draftId}
        source={source}
        onSaved={props.onSaved}
        onBack={() => {
          props.onInspectSource({ kind: 'revision', revision: null });
        }}
        onPendingChanged={props.onPendingChanged}
        onRestore={(revision) => {
          props.onInspectSource({ kind: 'restore', revision });
        }}
      />
    );
  return <ScenarioContent {...props} source={source} />;
}

function ScenarioContent({
  client,
  draftId,
  source,
  onSaved,
  onInspectSource,
  headRevision,
  revisions,
  initialMode = 'inspect',
  initialEntityId,
  onVisual,
  onPendingChanged,
  onRefreshHistory,
}: Omit<ScenarioProps, 'source'> & { readonly source: ReadScenarioSource }) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null),
    [mode, setMode] = useState<ScenarioMode>(initialMode);
  const [compare, setCompare] = useState(headRevision),
    [manualReview, setManualReview] = useState(false);
  const [buffer, setBuffer] = useState<ManualDraftBuffer | null>(null);
  const [aiDraft, setAiDraft] = useState<AiEditDraft>({ instruction: '', targets: [] }),
    [operationPending, setOperationPending] = useState(false);
  const section = useRef<HTMLElement>(null),
    restoreFocus = useRef(false),
    knownHead = useRef(0);
  const contextKey = readScenarioKey(source);
  const { resource, retry, reread } = useScenarioResource(client, draftId, source);
  const data = resource.status === 'ready' ? resource.value : null,
    context = data?.context ?? null;
  useEffect(() => {
    if (
      context &&
      context.revision.revision > headRevision &&
      context.revision.revision > knownHead.current
    ) {
      knownHead.current = context.revision.revision;
      onRefreshHistory();
    }
  }, [context, headRevision, onRefreshHistory]);
  useEffect(() => {
    if (!initialEntityId || !data?.entities) return;
    const entry = Object.entries(data.entities).find(([, id]) => id === initialEntityId);
    if (entry) setSelected(`entities.${entry[0]}`);
  }, [initialEntityId, data]);
  useEffect(() => {
    if (resource.status !== 'ready' || !restoreFocus.current) return;
    restoreFocus.current = false;
    const target = section.current?.querySelector<HTMLElement>(
      '.scenario-inspector-target,.campaign-manual-editor',
    );
    target?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width:1099px)').matches) target?.scrollIntoView({ block: 'start' });
  }, [resource]);
  const saving = useScenarioSave({
    client,
    draftId,
    context,
    contextKey,
    writable: source.kind === 'revision',
    bufferBaseDigest: buffer?.baseDigest ?? null,
    onConflict: () => {
      reread();
      onRefreshHistory();
    },
    onSaved: (revision) => {
      setBuffer(null);
      setManualReview(false);
      restoreFocus.current = true;
      onSaved(revision);
    },
  });
  const { state: saveState, conflict, save } = saving;
  const dirty = buffer !== null && JSON.stringify(buffer.value) !== JSON.stringify(buffer.base);
  const stale =
    buffer !== null && context !== null && buffer.baseDigest !== context.revision.digest;
  const blocked = saveState !== 'idle';
  useEffect(() => {
    onPendingChanged(blocked || dirty || operationPending);
    return () => {
      onPendingChanged(false);
    };
  }, [blocked, dirty, operationPending, onPendingChanged]);
  const reload = () => {
    saving.discard();
    setBuffer(null);
    setManualReview(false);
    retry();
  };
  const index = data?.content ? buildScenarioIndex(data.content) : null;
  const node = index ? index.byPath.get(nearestScenarioPath(index, selected)) : null;
  const selectedProtected =
    context && node
      ? contentPathLocked(context, data?.content, [
          node.group,
          ...(node.group === 'visuals' ||
          node.group === 'entities' ||
          node.group === 'knowledge' ||
          node.group === 'clues' ||
          node.group === 'encounters' ||
          node.group === 'situations' ||
          node.group === 'conflicts' ||
          node.group === 'quests'
            ? [(data?.content?.[node.group] ?? []).findIndex((item) => item === node.value)]
            : []),
        ])
      : false;
  return (
    <section ref={section} className="workshop-scenario" aria-label={t('Scenario')}>
      <div className="workshop-section-heading">
        <h3>
          {source.kind === 'step'
            ? t('Saved preparation step')
            : source.kind === 'candidate'
              ? t('Unattached generation proposal')
              : t('Scenario overview')}
        </h3>
        <button type="button" onClick={reload}>
          {t('Reload saved content')}
        </button>
      </div>
      {source.kind === 'step' ? (
        <p>
          {t(
            'This is unfinished preparation from one saved step. It has not passed the complete campaign checks.',
          )}
        </p>
      ) : (
        source.kind === 'candidate' && (
          <p>
            {t('This proposal is separate from saved revisions. It cannot change a played world.')}
          </p>
        )
      )}
      {context && (
        <>
          <nav className="campaign-edit-modes" aria-label={t('Scenario editing actions')}>
            {(['inspect', 'edit', 'ai', 'locks'] as const).map((next) => (
              <button
                type="button"
                key={next}
                aria-pressed={mode === next}
                disabled={saveState === 'saving' || saveState === 'uncertain' || operationPending}
                onClick={() => {
                  setMode(next);
                }}
              >
                {next === 'inspect'
                  ? t('Inspect scenario')
                  : next === 'edit'
                    ? t('Structured editing')
                    : next === 'ai'
                      ? t('Targeted AI edit')
                      : t('Protections')}
              </button>
            ))}
          </nav>
          <div className="campaign-compare-controls">
            <label htmlFor="scenario-compare-revision">{t('Compare with revision')}</label>
            <select
              id="scenario-compare-revision"
              value={compare}
              onChange={(event) => {
                setCompare(Number(event.target.value));
              }}
            >
              {revisions.map((entry) => (
                <option key={entry.revision} value={entry.revision}>
                  {t('Revision {revision}', { revision: entry.revision })}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={blocked || dirty || compare === 0}
              onClick={() => {
                onInspectSource({ kind: 'compare', from: context.revision.revision, to: compare });
              }}
            >
              {t('Compare revisions')}
            </button>
            {context.revision.revision !== headRevision && (
              <button
                type="button"
                disabled={blocked || dirty}
                onClick={() => {
                  onInspectSource({ kind: 'restore', revision: context.revision.revision });
                }}
              >
                {t('Restore as a new revision')}
              </button>
            )}
          </div>
        </>
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
              type="button"
              onClick={() => {
                saving.retry();
              }}
            >
              {t('Retry original correction')}
            </button>
          )}
          {conflict !== null && <EditConflict value={conflict} />}
          {saveState === 'conflict' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMode('locks');
                }}
              >
                {t('Review protections')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const kept = saving.keepChanges();
                  if (kept) setBuffer(kept);
                  setMode('edit');
                }}
              >
                {t('Keep changes and start a new save')}
              </button>
            </>
          )}
        </div>
      )}
      {stale && (
        <p role="status">
          {t(
            'The selected revision changed. Your manual buffer is kept; discard it before editing a newer revision.',
          )}
        </p>
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
      ) : !data?.content ? (
        <p>{t('Generate a campaign to prepare its scenario.')}</p>
      ) : context && mode === 'edit' ? (
        <div className="campaign-manual-workspace">
          <CampaignManualEditor
            base={buffer?.base ?? data.content}
            value={buffer?.value ?? data.content}
            initialSection={node?.group ?? 'world'}
            pending={blocked || stale}
            onChange={(value) => {
              setBuffer((previous) =>
                previous
                  ? { ...previous, value }
                  : {
                      baseDigest: context.revision.digest,
                      baseRevision: context.revision.revision,
                      base: context.revision.content,
                      value,
                    },
              );
            }}
            onSave={save}
            onDiscard={() => {
              setBuffer(null);
              setManualReview(false);
            }}
            isLocked={(path) => contentPathLocked(context, buffer?.value ?? data.content, path)}
          />
          {dirty &&
            (() => {
              const parsed = campaignPackageSchema.safeParse(buffer.value);
              return (
                parsed.success && (
                  <>
                    <button
                      type="button"
                      aria-expanded={manualReview}
                      onClick={() => {
                        setManualReview((open) => !open);
                      }}
                    >
                      {t('Review manual changes')}
                    </button>
                    {manualReview && <CampaignChanges before={buffer.base} after={parsed.data} />}
                  </>
                )
              );
            })()}
        </div>
      ) : context && mode === 'ai' ? (
        <CampaignAiEdit
          client={client}
          draftId={draftId}
          context={context}
          historical={context.revision.revision !== headRevision}
          dirty={dirty}
          draft={aiDraft}
          onDraftChange={setAiDraft}
          onPendingChanged={setOperationPending}
          onReview={(jobId) => {
            onInspectSource({ kind: 'review', jobId });
          }}
          onRefresh={reread}
        />
      ) : context && mode === 'locks' ? (
        <CampaignLocks
          client={client}
          draftId={draftId}
          context={context}
          historical={context.revision.revision !== headRevision}
          onRefresh={reread}
          onPendingChanged={setOperationPending}
        />
      ) : (
        <>
          {context && node && selectedProtected && (
            <p role="status">
              {t('Selected content is protected. Open Protections to unlock it explicitly.')}
            </p>
          )}
          {dirty && <p role="status">{t('Your manual changes are kept in Structured editing.')}</p>}
          {context &&
            onVisual &&
            node &&
            (() => {
              const target = targetForNode(context, node);
              const key = target?.key?.split(':')[0];
              const entityId = key ? context.revision.identities.entities[key] : null;
              return (
                entityId &&
                ['entities', 'visuals'].includes(node.group) && (
                  <button
                    className="workshop-object-link"
                    type="button"
                    disabled={blocked || dirty}
                    onClick={() => {
                      onVisual(context.revision.revision, entityId);
                    }}
                  >
                    {t('View selected object in world')}
                  </button>
                )
              );
            })()}
          <ScenarioBrowser
            content={data.content}
            assessment={data.assessment}
            selectedPath={selected}
            onSelect={setSelected}
            {...(context && !dirty && !selectedProtected ? { onSave: save } : {})}
          />
        </>
      )}
    </section>
  );
}
