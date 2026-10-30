import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  enqueueCampaignGenerationSchema,
  retryCampaignGenerationSchema,
} from './generation-jobs.ts';

const body = () => ({
  requestId: randomUUID(),
  basedOnRevision: 0,
  brief: {
    intent: 'Ледяной колокол',
    setting: '',
    tone: '',
    duration: '',
    partySize: 3,
    partyLevel: 3,
    include: [],
    exclude: [],
  },
});
describe('campaign generation requests', () => {
  it('accepts author intent and binds all authority/provenance/session data on the server', () => {
    expect(enqueueCampaignGenerationSchema.safeParse(body()).success).toBe(true);
    for (const forged of [
      { ownerId: randomUUID() },
      { sessionId: randomUUID() },
      { approvalId: 'forged' },
      { provider: 'forged' },
      { source: { kind: 'AI' } },
      { fence: '1' },
    ])
      expect(enqueueCampaignGenerationSchema.safeParse({ ...body(), ...forged }).success).toBe(
        false,
      );
  });
  it('rejects malformed bases, unsupported party parameters and retry authority', () => {
    expect(
      enqueueCampaignGenerationSchema.safeParse({ ...body(), basedOnRevision: -1 }).success,
    ).toBe(false);
    expect(
      enqueueCampaignGenerationSchema.safeParse({ ...body(), basedOnRevision: 1_000_000 }).success,
    ).toBe(false);
    expect(
      enqueueCampaignGenerationSchema.safeParse({
        ...body(),
        brief: { ...body().brief, partySize: 0 },
      }).success,
    ).toBe(false);
    expect(
      retryCampaignGenerationSchema.safeParse({ requestId: randomUUID(), sessionClass: 'play' })
        .success,
    ).toBe(false);
  });
});
