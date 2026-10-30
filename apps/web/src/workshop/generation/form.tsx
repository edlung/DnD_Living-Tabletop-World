import { campaignBriefSchema, type CampaignPackage } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';

import type { WorkshopClient } from '../client.ts';
import { jobAnswerSchema } from '../response-schemas.ts';
import { useRequestSignal } from '../use-request-signal.ts';

type Brief = CampaignPackage['brief'];
const emptyBrief = (): Brief => ({
  intent: '',
  setting: '',
  tone: '',
  duration: '',
  partySize: 3,
  partyLevel: 3,
  include: [],
  exclude: [],
});

export function GenerationForm({
  client,
  draftId,
  headRevision,
  initialBrief,
  restoring,
  enabled,
  running,
  onQueued,
  onConflict,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly headRevision: number;
  readonly initialBrief: Brief | null;
  readonly restoring: boolean;
  readonly enabled: boolean;
  readonly running: boolean;
  readonly onQueued: (jobId: string) => void;
  readonly onConflict: () => void;
}) {
  const t = useT();
  const [brief, setBrief] = useState(emptyBrief);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<
    'idle' | 'busy' | 'uncertain' | 'conflict' | 'unavailable' | 'invalid' | 'started'
  >('idle');
  const pending = useRef<{ requestId: string; basedOnRevision: number; brief: Brief } | null>(null);
  const alive = useRef(true);
  const signal = useRequestSignal();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!restoring && !ready) {
      setBrief(initialBrief ?? emptyBrief());
      setReady(true);
    }
  }, [restoring, ready, initialBrief]);
  const update = <Key extends keyof Brief>(key: Key, value: Brief[Key]) => {
    setBrief((previous) => ({ ...previous, [key]: value }));
    setStatus('idle');
  };
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'busy' || !ready || !enabled || running) return;
    const parsed = campaignBriefSchema.safeParse({
      ...brief,
      include: brief.include.map((line) => line.trim()).filter(Boolean),
      exclude: brief.exclude.map((line) => line.trim()).filter(Boolean),
    });
    if (!parsed.success) {
      setStatus('invalid');
      return;
    }
    const payload = pending.current ?? {
      requestId: crypto.randomUUID(),
      basedOnRevision: headRevision,
      brief: parsed.data,
    };
    pending.current = payload;
    setStatus('busy');
    const result = await client.request(`/drafts/${draftId}/generation`, jobAnswerSchema, {
      body: payload,
      signal: signal(),
    });
    if (!alive.current) return;
    if (result.kind === 'ready') {
      pending.current = null;
      setStatus('started');
      onQueued(result.value.job.jobId);
    } else if (result.kind === 'conflict') {
      setStatus('conflict');
      onConflict();
    } else if (result.kind === 'unavailable') {
      pending.current = null;
      setStatus('unavailable');
      onConflict();
    } else if (result.kind !== 'cancelled' && result.kind !== 'signed-out') setStatus('uncertain');
  };
  const locked =
    !ready || !enabled || running || ['busy', 'uncertain', 'conflict'].includes(status);
  return (
    <section className="workshop-panel workshop-generation-form">
      <h3>{t('Prepare your campaign')}</h3>
      <p>
        {t(
          'Describe the campaign you want. Generation prepares a private draft for you to inspect.',
        )}
      </p>
      {restoring && !ready && <p role="status">{t('Restoring the campaign brief…')}</p>}
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <fieldset disabled={locked}>
          <legend className="visually-hidden">{t('Campaign brief')}</legend>
          <label htmlFor="campaign-idea">{t('Campaign idea')}</label>
          <textarea
            id="campaign-idea"
            required
            maxLength={8000}
            rows={4}
            value={brief.intent}
            onChange={(event) => {
              update('intent', event.target.value);
            }}
          />
          <div className="workshop-form-grid">
            {(['setting', 'tone', 'duration'] as const).map((key) => (
              <div key={key}>
                <label htmlFor={`campaign-${key}`}>
                  {t(key === 'setting' ? 'Setting' : key === 'tone' ? 'Tone' : 'Duration')}
                </label>
                <input
                  id={`campaign-${key}`}
                  maxLength={4000}
                  value={brief[key]}
                  onChange={(event) => {
                    update(key, event.target.value);
                  }}
                />
              </div>
            ))}
            <div>
              <label htmlFor="campaign-party-size">{t('Party size')}</label>
              <input
                id="campaign-party-size"
                type="number"
                min={1}
                max={16}
                required
                value={brief.partySize}
                onChange={(event) => {
                  update('partySize', Number(event.target.value));
                }}
              />
            </div>
            <div>
              <label htmlFor="campaign-party-level">{t('Party level')}</label>
              <input
                id="campaign-party-level"
                type="number"
                min={1}
                max={20}
                required
                value={brief.partyLevel}
                onChange={(event) => {
                  update('partyLevel', Number(event.target.value));
                }}
              />
            </div>
          </div>
          {(['include', 'exclude'] as const).map((key) => (
            <div key={key}>
              <label htmlFor={`campaign-${key}`}>
                {t(key === 'include' ? 'Include' : 'Exclude')}
              </label>
              <textarea
                id={`campaign-${key}`}
                rows={2}
                value={brief[key].join('\n')}
                maxLength={8000}
                aria-describedby="campaign-list-hint"
                onChange={(event) => {
                  update(key, event.target.value.split('\n'));
                }}
              />
            </div>
          ))}
          <p id="campaign-list-hint" className="muted">
            {t('One item per line, up to 32 items.')}
          </p>
        </fieldset>
        {running && <p>{t('A generation is already in progress.')}</p>}
        <button
          className="primary-button"
          type="submit"
          disabled={!ready || !enabled || running || status === 'busy' || status === 'conflict'}
        >
          {status === 'busy'
            ? t('Starting generation…')
            : status === 'uncertain'
              ? t('Retry generation request')
              : t('Generate campaign')}
        </button>
        <div aria-live="polite">
          {status === 'invalid' && (
            <p>{t('Check the campaign brief and the number of listed items.')}</p>
          )}
          {status === 'started' && (
            <p>{t('Generation started. You can follow its progress here.')}</p>
          )}
          {status === 'uncertain' && (
            <p>{t('The answer is uncertain. Retry sends the same generation request.')}</p>
          )}
          {status === 'conflict' && (
            <p>{t('This draft changed or already has a generation. Your brief is kept.')}</p>
          )}
          {status === 'unavailable' && (
            <p>{t('Generation is temporarily unavailable. Try again.')}</p>
          )}
        </div>
        {status === 'conflict' && (
          <button
            type="button"
            onClick={() => {
              pending.current = null;
              setStatus('idle');
            }}
          >
            {t('Keep brief and start a new request')}
          </button>
        )}
      </form>
    </section>
  );
}
