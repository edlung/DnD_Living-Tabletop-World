import {
  planCampaignEditSchema,
  type CampaignEditPlanView,
  type PlanCampaignEdit,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useState } from 'react';

import type { WorkshopClient } from '../client.ts';
import { jobAnswerSchema } from '../response-schemas.ts';
import { PendingEditReceipt } from './conflicts.tsx';
import { EditJobs } from './edit-jobs.tsx';
import { editPlanSchema, type EditingContext } from './schemas.ts';
import { useEditAction } from './use-action.ts';
import { EditClosure } from './closure.tsx';
import { TargetGroups } from './target-groups.tsx';

export interface AiEditDraft {
  readonly instruction: string;
  readonly targets: readonly string[];
}
export function CampaignAiEdit({
  client,
  draftId,
  context,
  historical,
  dirty,
  onReview,
  onRefresh,
  onPendingChanged,
  draft,
  onDraftChange,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly context: EditingContext;
  readonly historical: boolean;
  readonly dirty: boolean;
  readonly onReview: (jobId: string) => void;
  readonly onRefresh: () => void;
  readonly onPendingChanged: (pending: boolean) => void;
  readonly draft: AiEditDraft;
  readonly onDraftChange: (draft: AiEditDraft) => void;
}) {
  const t = useT();
  const planning = useEditAction(client),
    queue = useEditAction(client);
  const { instruction, targets } = draft;
  const [query, setQuery] = useState('');
  const setInstruction = (value: string) => {
    onDraftChange({ ...draft, instruction: value });
  };
  const setTargets = (value: readonly string[]) => {
    onDraftChange({ ...draft, targets: value });
  };
  const [plan, setPlan] = useState<CampaignEditPlanView | null>(null),
    [invalid, setInvalid] = useState(false),
    [job, setJob] = useState<string | null>(null);
  const [planned, setPlanned] = useState<PlanCampaignEdit | null>(null);
  useEffect(() => {
    onPendingChanged(planning.blocked || queue.blocked);
    return () => {
      onPendingChanged(false);
    };
  }, [planning.blocked, queue.blocked, onPendingChanged]);
  const body = () => ({
    revision: context.revision.revision,
    packageDigest: context.revision.digest,
    expectedLockVersion: context.locks.version,
    manifestVersion: context.manifest.version,
    manifestDigest: context.manifest.digest,
    instruction,
    targets,
  });
  const inspect = async () => {
    const parsed = planCampaignEditSchema.safeParse(body());
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setPlanned(parsed.data);
    const result = await planning.run(`/drafts/${draftId}/edits/plan`, parsed.data, editPlanSchema);
    if (result.kind === 'ready') {
      setPlan(result.value);
      setInvalid(false);
    }
  };
  const enqueue = async () => {
    if (!plan?.spec || !planned || queue.blocked) return;
    const result = await queue.run(
      `/drafts/${draftId}/edits`,
      { requestId: crypto.randomUUID(), ...planned },
      jobAnswerSchema,
    );
    if (result.kind === 'ready') {
      setJob(result.value.job.jobId);
      onRefresh();
    }
  };
  const resetPlan = () => {
    setPlan(null);
    setPlanned(null);
    planning.reset();
    setInvalid(false);
  };
  const planStale =
    planned !== null &&
    (planned.packageDigest !== context.revision.digest ||
      planned.expectedLockVersion !== context.locks.version ||
      planned.manifestDigest !== context.manifest.digest);
  const locked = historical || dirty || planning.blocked || queue.blocked;
  return (
    <div className="campaign-ai-layout">
      <section className="workshop-panel campaign-ai-form" aria-label={t('Targeted AI edit')}>
        <h3>{t('Targeted AI edit')}</h3>
        <p>
          {t(
            'Choose the content to change. AI proposes changes within the resolved scope; nothing is saved as a revision until you review and apply it.',
          )}
        </p>
        {historical && (
          <p>{t('Restore a historical revision before requesting an edit from it.')}</p>
        )}
        {dirty && (
          <p role="status">
            {t('Save or discard your manual changes before requesting an AI edit.')}
          </p>
        )}
        <label htmlFor="campaign-edit-instruction">{t('Instructions for this edit')}</label>
        <textarea
          id="campaign-edit-instruction"
          rows={4}
          maxLength={8000}
          value={instruction}
          disabled={locked}
          onChange={(event) => {
            setInstruction(event.target.value);
            resetPlan();
          }}
        />
        <label htmlFor="campaign-edit-target-search">{t('Find an edit target')}</label>
        <input
          id="campaign-edit-target-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <TargetGroups
          choices={[
            ...context.targets.map((target) => ({
              id: target.targetId,
              group: target.section,
              label: target.label,
              disabled: locked,
              notice: target.ambiguous
                ? t('Ambiguous object. Repair the whole section first.')
                : target.locked
                  ? t('Protected content')
                  : null,
            })),
            ...targets
              .filter((id) => !context.targets.some((target) => target.targetId === id))
              .map((id) => ({
                id,
                group: 'previous',
                label: t('An earlier target'),
                disabled: locked,
                notice: t('This target is no longer present.'),
              })),
          ]}
          selected={new Set(targets)}
          query={query}
          onToggle={(id, checked) => {
            setTargets(checked ? [...targets, id] : targets.filter((value) => value !== id));
            resetPlan();
          }}
        />
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            void inspect();
          }}
        >
          {planning.state === 'busy' ? t('Checking dependencies…') : t('Review edit scope')}
        </button>
        {invalid && (
          <p role="alert">{t('Add instructions and choose between 1 and 100 targets.')}</p>
        )}
        <PendingEditReceipt
          action={planning}
          onRetry={() => {
            void planning.retry().then((result) => {
              if (result.kind === 'ready') {
                const parsed = editPlanSchema.safeParse(result.value);
                if (parsed.success) setPlan(parsed.data);
              }
            });
          }}
          onReset={() => {
            planning.reset();
            setPlan(null);
            onRefresh();
          }}
        />
        {plan && <EditClosure plan={plan} />}
        {planStale && (
          <p role="status">
            {t('The revision or protections changed. Review the edit scope again before starting.')}
          </p>
        )}
        {plan?.spec && (
          <button
            className="primary-button"
            type="button"
            disabled={locked || planStale}
            onClick={() => {
              void enqueue();
            }}
          >
            {queue.state === 'busy' ? t('Starting edit…') : t('Prepare proposed changes')}
          </button>
        )}
        <PendingEditReceipt
          action={queue}
          onRetry={() => {
            void queue.retry().then((result) => {
              if (result.kind === 'ready') {
                const parsed = jobAnswerSchema.safeParse(result.value);
                if (parsed.success) setJob(parsed.data.job.jobId);
              }
            });
          }}
          onReset={() => {
            queue.reset();
            setPlan(null);
            onRefresh();
          }}
        />
      </section>
      <EditJobs
        client={client}
        draftId={draftId}
        selected={job}
        onSelect={setJob}
        onReview={onReview}
        targets={context.targets}
        canReuse={!locked}
        onReuse={(instruction, targets) => {
          onDraftChange({ instruction, targets });
          resetPlan();
        }}
      />
    </div>
  );
}
