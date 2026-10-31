import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useState } from 'react';

import { useResource } from '../../api/resource.ts';
import type { WorkshopClient, WorkshopResult } from '../client.ts';
import { PendingEditReceipt } from '../editing/conflicts.tsx';
import { revisionReviewSchema } from '../editing/schemas.ts';
import { useEditAction } from '../editing/use-action.ts';
import { EditClosure } from '../editing/closure.tsx';
import { purposeWords } from '../pictures/words.ts';
import { reviewedWriteAnswerSchema } from '../editing/schemas.ts';
import { ScenarioBrowser } from '../scenario/browser.tsx';
import { CampaignChanges } from './changes.tsx';

export type ReviewSource =
  | { readonly kind: 'review'; readonly jobId: string }
  | { readonly kind: 'compare'; readonly from: number; readonly to: number }
  | { readonly kind: 'restore'; readonly revision: number };
export function RevisionReview({
  client,
  draftId,
  source,
  onSaved,
  onBack,
  onRestore,
  onPendingChanged,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly source: ReviewSource;
  readonly onSaved: (revision: number) => void;
  readonly onBack: () => void;
  readonly onRestore: (revision: number) => void;
  readonly onPendingChanged: (pending: boolean) => void;
}) {
  const t = useT();
  const key =
    source.kind === 'review'
      ? `edit:${source.jobId}`
      : source.kind === 'compare'
        ? `compare:${source.from}:${source.to}`
        : `restore:${source.revision}`;
  const path =
    source.kind === 'review'
      ? `edits/${source.jobId}/review`
      : source.kind === 'compare'
        ? `compare?from=${String(source.from)}&to=${String(source.to)}`
        : `revisions/${String(source.revision)}/restore-review`;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await client.request(`/drafts/${draftId}/${path}`, revisionReviewSchema, {
        signal,
      });
      if (
        result.kind !== 'ready' ||
        result.value.kind !==
          (source.kind === 'review' ? 'EDIT' : source.kind === 'compare' ? 'COMPARE' : 'RESTORE')
      )
        throw new Error('REVIEW_UNAVAILABLE');
      if (source.kind === 'review' && result.value.sourceId !== source.jobId)
        throw new Error('REVIEW_UNAVAILABLE');
      return result.value;
    },
    [client, draftId, path, key],
  );
  const { resource, retry } = useResource(`review:${draftId}:${key}`, load);
  const action = useEditAction(client);
  useEffect(() => {
    onPendingChanged(action.blocked);
    return () => {
      onPendingChanged(false);
    };
  }, [action.blocked, onPendingChanged]);
  const [inspect, setInspect] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const finish = (result: WorkshopResult<unknown, unknown>) => {
    if (result.kind !== 'ready') return;
    const parsed = reviewedWriteAnswerSchema.safeParse(result.value);
    if (parsed.success && parsed.data.revision) onSaved(parsed.data.revision.revision);
  };
  const apply = async () => {
    if (
      resource.status !== 'ready' ||
      source.kind === 'compare' ||
      !resource.value.adoptable ||
      action.blocked
    )
      return;
    const value = resource.value;
    const body = {
      requestId: crypto.randomUUID(),
      basedOnRevision: value.before.revision,
      packageDigest: value.before.digest,
      expectedLockVersion: value.locks.version,
      manifestVersion: value.manifest.version,
      manifestDigest: value.manifest.digest,
      reviewDigest: value.reviewDigest,
      ...(source.kind === 'review' ? { candidateDigest: value.candidateDigest } : {}),
    };
    const writePath =
      source.kind === 'review'
        ? `edits/${source.jobId}/adopt`
        : `revisions/${String(source.revision)}/restore`;
    finish(await action.run(`/drafts/${draftId}/${writePath}`, body, reviewedWriteAnswerSchema));
  };
  return (
    <section className="campaign-review" aria-label={t('Review revision changes')}>
      <div className="workshop-section-heading">
        <h3>
          {source.kind === 'review'
            ? t('Review proposed changes')
            : source.kind === 'restore'
              ? t('Restore as a new revision')
              : t('Compare saved revisions')}
        </h3>
        <button type="button" disabled={action.blocked} onClick={onBack}>
          {t('Back to saved scenario')}
        </button>
      </div>
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={
            resource.status === 'error'
              ? t('The comparison could not be read.')
              : t('Reading the complete comparison…')
          }
          onRetry={retry}
        />
      ) : (
        (() => {
          const value = resource.value;
          const stateWords = {
            CURRENT: t('Current picture'),
            STALE: t('Chosen picture is stale'),
            MISSING: t('No chosen picture'),
          };
          return (
            <>
              <p>
                {t(
                  'Compared with saved revision {revision}. Applying creates a new revision and does not change played events.',
                  { revision: value.before.revision },
                )}
              </p>
              <div className="workshop-panel campaign-review-summary">
                {value.editSpec && (
                  <details>
                    <summary>{t('Original AI edit request')}</summary>
                    <p className="campaign-instruction">{value.editSpec.instruction}</p>
                    <p>{t('This is the exact scope captured when the AI edit started.')}</p>
                    <EditClosure
                      plan={{ spec: value.editSpec, targets: value.targets, conflicts: [] }}
                    />
                  </details>
                )}
                <p>
                  {value.assessment.readiness === 'READY'
                    ? t('Ready for review')
                    : value.assessment.readiness === 'INVALID'
                      ? t('Corrections needed')
                      : t('Preparation incomplete')}{' '}
                  ·{' '}
                  {t('Preparation findings: {count}', { count: value.assessment.findings.length })}
                </p>
                {value.issues.length > 0 && (
                  <p role="status">
                    {t(
                      'Review blockers: {count}. Review preparation checks and the requested scope before applying.',
                      { count: value.issues.length },
                    )}
                  </p>
                )}
                {value.conflicts.length > 0 && (
                  <section className="campaign-conflict">
                    <h4>{t('Protection conflicts')}</h4>
                    <ul>
                      {value.conflicts.map((entry, index) => (
                        <li key={index}>
                          {entry.label} ·{' '}
                          {entry.reason === 'IMAGE_CHANGED'
                            ? t('The protected picture would change or become stale.')
                            : entry.reason === 'TARGET_MISSING'
                              ? t('The protected content would be removed.')
                              : t('The protected content would change.')}
                        </li>
                      ))}
                    </ul>
                    <p>
                      {t(
                        'Unlock the affected protection explicitly or request a narrower change. No protection is removed automatically.',
                      )}
                    </p>
                  </section>
                )}
                {value.visualChanges.length > 0 && (
                  <section>
                    <h4>{t('Consequences for chosen pictures')}</h4>
                    <ul>
                      {value.visualChanges.map((change, index) => {
                        const entityKey = Object.entries(value.before.identities.entities).find(
                          ([, id]) => id === change.entityId,
                        )?.[0];
                        const name =
                          value.before.content.entities.find((entity) => entity.key === entityKey)
                            ?.name ?? t('An earlier object');
                        return (
                          <li key={index}>
                            {name} · {purposeWords(t, change.purpose)}:{' '}
                            {stateWords[change.beforeState]} → {stateWords[change.afterState]}
                          </li>
                        );
                      })}
                    </ul>
                    <p>
                      {t(
                        'Pictures are never regenerated automatically. Stale or missing choices use the neutral fallback.',
                      )}
                    </p>
                  </section>
                )}
                <button
                  type="button"
                  aria-expanded={inspect}
                  onClick={() => {
                    setInspect((shown) => !shown);
                  }}
                >
                  {t('Inspect the complete proposed scenario')}
                </button>
                {source.kind !== 'compare' && (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!value.adoptable || action.blocked}
                    onClick={() => {
                      void apply();
                    }}
                  >
                    {action.state === 'busy'
                      ? t('Applying reviewed changes…')
                      : source.kind === 'restore'
                        ? t('Restore as a new revision')
                        : t('Apply proposal as a new revision')}
                  </button>
                )}
                {source.kind === 'compare' && (
                  <button
                    type="button"
                    onClick={() => {
                      onRestore(source.to);
                    }}
                  >
                    {t('Restore compared revision as new')}
                  </button>
                )}
                <button type="button" disabled={action.blocked} onClick={retry}>
                  {t('Refresh reviewed changes')}
                </button>
                {!value.adoptable && source.kind !== 'compare' && (
                  <p>
                    {t(
                      'This result cannot be applied until its conflicts or preparation problems are resolved.',
                    )}
                  </p>
                )}
                <PendingEditReceipt
                  action={action}
                  onRetry={() => {
                    void action.retry().then(finish);
                  }}
                  onReset={() => {
                    action.reset();
                    retry();
                  }}
                />
              </div>
              <CampaignChanges before={value.before.content} after={value.after} />
              {inspect && (
                <ScenarioBrowser
                  content={value.after}
                  assessment={value.assessment}
                  selectedPath={selected}
                  onSelect={setSelected}
                />
              )}
            </>
          );
        })()
      )}
    </section>
  );
}
