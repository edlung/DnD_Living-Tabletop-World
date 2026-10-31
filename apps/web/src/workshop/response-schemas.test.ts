import { describe, expect, it } from 'vitest';

import { progressSchema } from './response-schemas.ts';

const id = '00000000-0000-4000-8000-000000000001';
const time = '2026-10-30T12:00:00.000Z';
const progress = () => ({
  job: {
    jobId: id,
    draftId: id,
    baseRevision: 0,
    status: 'QUEUED',
    nextStep: 0,
    createdAt: time,
    updatedAt: time,
    attachedRevision: null,
    candidateAvailable: false,
    failureCode: null,
  },
  brief: {
    intent: 'An unfinished brief',
    setting: '',
    tone: '',
    duration: '',
    partySize: 3,
    partyLevel: 3,
    include: [],
    exclude: [],
  },
  steps: [],
  candidate: null,
});
describe('lightweight generation progress boundary', () => {
  it('restores the brief even before the first step exists', () => {
    expect(progressSchema.parse(progress()).brief.intent).toBe('An unfinished brief');
  });
  it('rejects packages accidentally added to root, steps or candidate summaries', () => {
    expect(
      progressSchema.safeParse({ ...progress(), content: { private: 'package' } }).success,
    ).toBe(false);
    expect(
      progressSchema.safeParse({
        ...progress(),
        steps: [
          {
            ordinal: 0,
            stage: 'concept',
            status: 'PREPARED',
            traceId: id,
            provider: null,
            model: null,
            createdAt: time,
            completedAt: null,
            content: { private: 'package' },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      progressSchema.safeParse({
        ...progress(),
        candidate: {
          contentDigest: 'digest',
          baseRevision: 0,
          createdAt: time,
          content: { private: 'package' },
        },
      }).success,
    ).toBe(false);
  });
});
