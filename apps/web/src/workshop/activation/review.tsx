import {
  campaignActivationReviewSchema,
  type CampaignActivationConflict,
  type CampaignActivationReview,
  type CampaignActivationView,
} from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useState } from 'react';

import { useResource } from '../../api/resource.ts';
import type { WorkshopClient } from '../client.ts';
import { purposeWords } from '../pictures/words.ts';
import { FINDING_LABELS } from '../scenario/findings.ts';
import { activationIntent, activationWarningIds, matchesActivationReview } from './model.ts';
import { useActivationIntent } from './use-activation.ts';

export function ActivationReview({
  client,
  draftId,
  revision,
  onAccepted,
  onPendingChanged,
  onInspect,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly revision: number;
  readonly onAccepted: (activation: CampaignActivationView) => void;
  readonly onPendingChanged: (pending: boolean) => void;
  readonly onInspect: () => void;
}) {
  const t = useT();
  const [textOnly, setTextOnly] = useState(false),
    [pending, setPending] = useState(false);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await client.request(
        `/drafts/${draftId}/activation-review?revision=${revision}&textOnly=${String(textOnly)}`,
        campaignActivationReviewSchema,
        { signal },
      );
      if (
        result.kind !== 'ready' ||
        !matchesActivationReview(result.value, draftId, revision, textOnly)
      )
        throw new Error('WORKSHOP_READ_FAILED');
      return result.value;
    },
    [client, draftId, revision, textOnly],
  );
  const review = useResource(`activation-review:${draftId}:${revision}:${String(textOnly)}`, load);
  const confirmed = review.resource.status === 'ready' ? review.resource.value.activation : null;
  useEffect(() => {
    if (confirmed) onAccepted(confirmed);
  }, [confirmed, onAccepted]);
  const pendingChanged = useCallback(
    (value: boolean) => {
      setPending(value);
      onPendingChanged(value);
    },
    [onPendingChanged],
  );
  return (
    <section className="campaign-activation-review" aria-labelledby="activation-review-title">
      <h3 id="activation-review-title">{t('Review campaign activation')}</h3>
      <p>
        {t(
          'Start play from this saved revision. Your confirmation creates one campaign; later draft changes stay in the workshop.',
        )}
      </p>
      <fieldset className="workshop-panel campaign-activation-policy" disabled={pending}>
        <legend>{t('Picture policy')}</legend>
        <label className="campaign-checkbox">
          <input
            type="radio"
            name="activation-picture-policy"
            checked={!textOnly}
            onChange={() => {
              setTextOnly(false);
            }}
          />
          <span>{t('Use selected draft pictures')}</span>
        </label>
        <label className="campaign-checkbox">
          <input
            type="radio"
            name="activation-picture-policy"
            checked={textOnly}
            onChange={() => {
              setTextOnly(true);
            }}
          />
          <span>{t('Text-only campaign')}</span>
        </label>
        <p>
          {textOnly
            ? t(
                'Text-only activation copies no pictures, including pictures already chosen in this draft.',
              )
            : t('Selected pictures must be current. Unselected pictures use the neutral fallback.')}
        </p>
      </fieldset>
      {review.resource.status !== 'ready' ? (
        <StatusPanel
          state={review.resource.status}
          label={
            review.resource.status === 'error'
              ? t('Activation review could not be read. Refresh the saved revision and try again.')
              : t('Checking the saved campaign for activation…')
          }
          onRetry={review.retry}
        />
      ) : confirmed ? (
        <StatusPanel state="loading" label={t('Reading the confirmed campaign…')} />
      ) : (
        <ActivationConsent
          key={review.resource.value.reviewDigest}
          client={client}
          draftId={draftId}
          review={review.resource.value}
          onAccepted={onAccepted}
          onPendingChanged={pendingChanged}
          onRefresh={review.retry}
          onInspect={onInspect}
        />
      )}
    </section>
  );
}

function ActivationConsent({
  client,
  draftId,
  review,
  onAccepted,
  onPendingChanged,
  onRefresh,
  onInspect,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly review: CampaignActivationReview;
  readonly onAccepted: (activation: CampaignActivationView) => void;
  readonly onPendingChanged: (pending: boolean) => void;
  readonly onRefresh: () => void;
  readonly onInspect: () => void;
}) {
  const t = useT();
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(() => new Set());
  const action = useActivationIntent(client, draftId, onAccepted);
  useEffect(() => {
    onPendingChanged(action.blocked);
    return () => {
      onPendingChanged(false);
    };
  }, [action.blocked, onPendingChanged]);
  const warnings = activationWarningIds(review);
  const missing = warnings.filter((id) => !acknowledged.has(id)).length;
  const confirm = () => {
    const body = activationIntent(review, acknowledged, crypto.randomUUID());
    if (body) void action.run(body);
  };
  return (
    <div className="workshop-panel campaign-activation-consent">
      <h4>
        {t('Revision {revision}', { revision: review.revision })} · {review.title}
      </h4>
      <p>
        {t('Activation readiness')}:{' '}
        {review.readiness === 'READY'
          ? t('Ready for review')
          : review.readiness === 'INVALID'
            ? t('Corrections needed')
            : t('Preparation incomplete')}
      </p>
      <p>{t('Pictures to copy: {count}', { count: review.visuals.adopted })}</p>
      <p>
        {t('Current choices: {current} · Stale choices: {stale} · Unselected: {missing}', {
          current: review.visuals.current,
          stale: review.visuals.stale,
          missing: review.visuals.missing,
        })}
      </p>
      {review.visuals.requiresTextOnly && !review.textOnly && (
        <p role="status">
          {t(
            'Choose a current picture or explicitly select a text-only campaign before activation.',
          )}
        </p>
      )}
      {review.visuals.entries.length > 0 && (
        <details className="campaign-activation-pictures">
          <summary>{t('Review chosen pictures')}</summary>
          <ul>
            {review.visuals.entries.map((entry, index) => (
              <li key={index}>
                {entry.name} · {purposeWords(t, entry.purpose)} ·{' '}
                {entry.state === 'CURRENT' ? t('Current picture') : t('Chosen picture is stale')}
              </li>
            ))}
          </ul>
        </details>
      )}
      <h4>{t('Activation findings')}</h4>
      {review.findings.length === 0 ? (
        <p>{t('No preparation findings.')}</p>
      ) : (
        <ul className="campaign-activation-findings">
          {review.findings.map((finding) => (
            <li key={finding.findingId}>
              {finding.severity === 'warning' ? (
                <label className="campaign-checkbox">
                  <input
                    type="checkbox"
                    checked={acknowledged.has(finding.findingId)}
                    disabled={action.state !== 'idle'}
                    onChange={(event) => {
                      setAcknowledged((previous) => {
                        const next = new Set(previous);
                        if (event.target.checked) next.add(finding.findingId);
                        else next.delete(finding.findingId);
                        return next;
                      });
                    }}
                  />
                  <span>
                    {t('I acknowledge: {finding}', {
                      finding: activationFindingWords(t, finding.code),
                    })}
                  </span>
                </label>
              ) : (
                <p>
                  {finding.severity === 'error' ? t('Error') : t('Note')} ·{' '}
                  {activationFindingWords(t, finding.code)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {missing > 0 && <p>{t('Acknowledge every warning to confirm this exact review.')}</p>}
      {!review.confirmable && (
        <p role="status">{t('Resolve the blocking findings before confirming activation.')}</p>
      )}
      {action.state === 'uncertain' ? (
        <div role="status" className="campaign-conflict">
          <p>
            {t(
              'The confirmation answer could not be verified. Retry sends the same confirmed revision and choices.',
            )}
          </p>
          <button type="button" onClick={action.retry}>
            {t('Retry original activation confirmation')}
          </button>
        </div>
      ) : action.state === 'conflict' ? (
        <div role="status" className="campaign-conflict">
          <p>{activationConflictWords(t, action.conflict)}</p>
          <button
            type="button"
            onClick={() => {
              action.reset();
              onRefresh();
            }}
          >
            {t('Read a new activation review')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="primary-button"
          disabled={action.state === 'busy' || !review.confirmable || missing > 0}
          onClick={confirm}
        >
          {action.state === 'busy'
            ? t('Confirming campaign activation…')
            : t('Confirm campaign activation')}
        </button>
      )}
      <button type="button" disabled={action.blocked} onClick={onInspect}>
        {t('Inspect the saved scenario')}
      </button>
      <button
        type="button"
        disabled={action.blocked}
        onClick={() => {
          action.reset();
          onRefresh();
        }}
      >
        {t('Refresh activation review')}
      </button>
    </div>
  );
}

type Translate = ReturnType<typeof useT>;
export function activationFindingWords(t: Translate, code: string): string {
  return t(
    FINDING_LABELS[code] ??
      ACTIVATION_FINDINGS[code] ??
      'Review this campaign finding before activation.',
  );
}
const ACTIVATION_FINDINGS: Readonly<Record<string, string>> = {
  ACTIVATION_HISTORICAL_REVISION:
    'Restore this historical revision as a new latest revision before activation.',
  ACTIVATION_NO_CURRENT_PICTURES:
    'Choose a current picture or explicitly select a text-only campaign before activation.',
  ACTIVATION_STALE_PICTURES:
    'Selected stale pictures must be replaced, removed or excluded through explicit text-only activation.',
  ACTIVATION_MISSING_PICTURES: 'Objects without chosen pictures will use the neutral fallback.',
  ACTIVATION_TEXT_ONLY:
    'Text-only activation copies no pictures, including pictures already chosen in this draft.',
  ACTIVATION_PICTURE_SOURCE:
    'A chosen picture could not be verified for copying. Review its source or choose text-only activation.',
  ACTIVATION_ALREADY_CONFIRMED:
    'This draft already has a confirmed campaign. Refresh activation status.',
};

function activationConflictWords(t: Translate, value: CampaignActivationConflict | null): string {
  switch (value?.conflict.reason) {
    case 'ALREADY_ACTIVATED':
      return t('This draft already has a confirmed campaign. Refresh activation status.');
    case 'ACKNOWLEDGEMENTS':
      return t('The warning acknowledgements changed. Read and acknowledge the new review.');
    case 'NOT_READY':
      return t('The campaign is not ready for activation. Read the current findings.');
    case 'REQUEST_REUSED':
      return t('This confirmation could not be reused. Read a new activation review.');
    default:
      return t(
        'The saved content, protections or pictures changed. Review the current revision before confirming again.',
      );
  }
}
