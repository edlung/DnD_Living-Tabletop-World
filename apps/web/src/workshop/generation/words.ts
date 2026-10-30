import type { CampaignGenerationStatus } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

const JOB_WORDS: Record<CampaignGenerationStatus, string> = {
  QUEUED: 'Waiting to generate',
  RUNNING: 'Generating campaign',
  SUCCEEDED: 'Generation completed',
  FAILED: 'Generation stopped',
  CANCELLED: 'Generation cancelled',
  DISPATCH_UNKNOWN: 'The AI response is uncertain',
};
const STEP_WORDS: Record<string, string> = {
  concept: 'Concept and opening',
  topology: 'Places and conflicts',
  cast: 'Cast and party',
  knowledge: 'Knowledge and clues',
  encounters: 'Prepared encounters',
  'first-session': 'First session',
  outline: 'Later sessions',
};
export const jobWords = (t: Translate, status: CampaignGenerationStatus): string =>
  t(JOB_WORDS[status]);
export const stepWords = (t: Translate, stage: string): string =>
  t(STEP_WORDS[stage] ?? 'Campaign preparation');

export const canRetryGeneration = (status: CampaignGenerationStatus): boolean =>
  status === 'FAILED';

export function stepStatusWords(
  t: Translate,
  step: 'PREPARED' | 'DISPATCHING' | 'SUCCEEDED',
  job: CampaignGenerationStatus,
): string {
  if (step === 'SUCCEEDED') return t('Step completed');
  if (job === 'FAILED') return t('Step failed');
  if (job === 'CANCELLED' || job === 'SUCCEEDED') return t('Step stopped');
  if (job === 'DISPATCH_UNKNOWN') return t('Step dispatch is uncertain');
  return step === 'DISPATCHING' && job === 'RUNNING' ? t('Waiting for AI') : t('Step prepared');
}

export const availabilityWords = (t: Translate, reason: string): string =>
  reason === 'NO_ROUTE'
    ? t('Campaign generation is not available yet.')
    : reason === 'NO_PREPARATION_GRANT'
      ? t('Generation is not enabled for this workshop.')
      : t('Generation is temporarily unavailable. Try again.');
