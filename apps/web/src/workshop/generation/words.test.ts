import { CAMPAIGN_GENERATION_STATUSES } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { canRetryGeneration, stepStatusWords } from './words.ts';

const t = (key: string): string => key;
describe('generation controls and honest terminal steps', () => {
  it('offers backend retry only for failed jobs', () => {
    for (const status of CAMPAIGN_GENERATION_STATUSES)
      expect(canRetryGeneration(status)).toBe(status === 'FAILED');
  });
  it('never presents a terminal or queued task as still waiting for AI', () => {
    for (const status of CAMPAIGN_GENERATION_STATUSES) {
      const word = stepStatusWords(t, 'DISPATCHING', status);
      expect(word === 'Waiting for AI').toBe(status === 'RUNNING');
    }
    expect(stepStatusWords(t, 'DISPATCHING', 'FAILED')).toBe('Step failed');
    expect(stepStatusWords(t, 'DISPATCHING', 'CANCELLED')).toBe('Step stopped');
    expect(stepStatusWords(t, 'DISPATCHING', 'DISPATCH_UNKNOWN')).toBe(
      'Step dispatch is uncertain',
    );
  });
  it('retains completed step results after cancellation or failure of a later step', () => {
    for (const status of CAMPAIGN_GENERATION_STATUSES)
      expect(stepStatusWords(t, 'SUCCEEDED', status)).toBe('Step completed');
  });
});
