import type { CampaignActivationReview, CampaignActivationView } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  activationIntent,
  activationWarningIds,
  matchesActivationReview,
  matchesActivationIntent,
  newestActivation,
} from './model.ts';

const id = 'cc5d933e-e73a-4baf-923c-31d260a6ec10';
const hash = (digit: string) => `sha256:${digit.repeat(64)}`;
const warning = {
  findingId: hash('8'),
  severity: 'warning' as const,
  code: 'ACTIVATION_MISSING_PICTURES',
  path: 'visuals',
  message: 'Some objects use the neutral fallback.',
};
const review = (patch: Partial<CampaignActivationReview> = {}): CampaignActivationReview => ({
  draftId: id,
  revision: 3,
  title: 'The winter river',
  language: 'en',
  packageDigest: hash('1'),
  planDigest: hash('2'),
  scenarioDigest: hash('3'),
  questDigest: hash('4'),
  manifestVersion: 5,
  manifestDigest: hash('5'),
  lockVersion: 6,
  lockDigest: hash('6'),
  textOnly: false,
  reviewDigest: hash('7'),
  readiness: 'READY',
  findings: [warning],
  visuals: {
    selected: 1,
    current: 1,
    stale: 0,
    missing: 2,
    adopted: 1,
    requiresTextOnly: false,
    entries: [],
  },
  confirmable: true,
  activation: null,
  ...patch,
});
const activation = (patch: Partial<CampaignActivationView> = {}): CampaignActivationView => ({
  activationId: id,
  draftId: id,
  campaignId: id,
  revision: 3,
  packageDigest: hash('1'),
  planDigest: hash('2'),
  manifestDigest: hash('5'),
  textOnly: false,
  status: 'PROVISIONING',
  phase: 'RESERVED',
  failureCode: null,
  retryable: false,
  createdAt: '2026-10-30T10:00:00.000Z',
  updatedAt: '2026-10-30T10:00:00.000Z',
  publishedAt: null,
  ...patch,
});

describe('an exact campaign activation confirmation', () => {
  it('binds the server revision, plan, locks, manifest and review without accepting authored content', () => {
    const source = review();
    expect(activationIntent(source, new Set([warning.findingId]), id)).toEqual({
      requestId: id,
      revision: 3,
      packageDigest: hash('1'),
      planDigest: hash('2'),
      manifestVersion: 5,
      manifestDigest: hash('5'),
      expectedLockVersion: 6,
      lockDigest: hash('6'),
      reviewDigest: hash('7'),
      acknowledgedFindingIds: [warning.findingId],
      textOnly: false,
    });
    expect(source).toEqual(review());
  });

  it('requires each exact warning identity rather than its code or array position', () => {
    expect(activationWarningIds(review())).toEqual([warning.findingId]);
    expect(
      activationIntent(review(), new Set(['ACTIVATION_MISSING_PICTURES', '0']), id),
    ).toBeNull();
    expect(activationIntent(review(), new Set(), id)).toBeNull();
  });

  it('copies only current warning IDs in review order, ignoring unrelated client acknowledgements', () => {
    const second = { ...warning, findingId: hash('9') };
    const source = review({
      findings: [warning, { ...warning, severity: 'info', findingId: hash('a') }, second],
    });
    expect(
      activationIntent(source, new Set([hash('9'), hash('a'), hash('8'), 'unrelated']), id)
        ?.acknowledgedFindingIds,
    ).toEqual([hash('8'), hash('9')]);
  });

  it('never acknowledges away errors, incomplete content, or a server refusal', () => {
    const ack = new Set([warning.findingId]);
    expect(activationIntent(review({ readiness: 'INCOMPLETE' }), ack, id)).toBeNull();
    expect(activationIntent(review({ readiness: 'INVALID' }), ack, id)).toBeNull();
    expect(activationIntent(review({ confirmable: false }), ack, id)).toBeNull();
    expect(
      activationIntent(review({ findings: [{ ...warning, severity: 'error' }] }), ack, id),
    ).toBeNull();
    expect(activationIntent(review({ activation: activation() }), ack, id)).toBeNull();
  });

  it('carries an explicit text-only choice while preserving the exact selected-manifest binding', () => {
    const source = review({ textOnly: true, visuals: { ...review().visuals, adopted: 0 } });
    const intent = activationIntent(source, new Set([warning.findingId]), id);
    expect(intent?.textOnly).toBe(true);
    expect(intent?.manifestDigest).toBe(source.manifestDigest);
  });

  it('rejects responses for another draft, stored revision or picture policy', () => {
    expect(matchesActivationReview(review(), id, 3, false)).toBe(true);
    expect(matchesActivationReview(review(), 'other', 3, false)).toBe(false);
    expect(matchesActivationReview(review(), id, 4, false)).toBe(false);
    expect(matchesActivationReview(review(), id, 3, true)).toBe(false);
  });

  it('accepts a durable answer only for the exact confirmed source and owner draft', () => {
    const intent = activationIntent(review(), new Set([warning.findingId]), id);
    if (!intent) throw new Error('Expected a valid test intention');
    expect(matchesActivationIntent(activation(), intent, id)).toBe(true);
    for (const patch of [
      { draftId: 'other' },
      { revision: 4 },
      { packageDigest: hash('f') },
      { planDigest: hash('f') },
      { manifestDigest: hash('f') },
      { textOnly: true },
    ])
      expect(matchesActivationIntent(activation(patch), intent, id)).toBe(false);
  });
});

describe('confirmed activation metadata', () => {
  it('preserves publication across an older provisioning answer', () => {
    const published = activation({
      status: 'PUBLISHED',
      phase: 'PUBLISHED',
      publishedAt: '2026-10-30T10:01:00.000Z',
    });
    expect(newestActivation(published, activation())).toBe(published);
    expect(newestActivation(activation(), published)).toBe(published);
  });

  it('uses the newest control state without changing the original confirmed revision', () => {
    const first = activation(),
      later = activation({ phase: 'CONTENT_READY', updatedAt: '2026-10-30T10:00:30.000Z' });
    expect(newestActivation(first, later)).toBe(later);
    expect(newestActivation(later, first)).toBe(later);
    expect(newestActivation(null, later)).toBe(later);
    expect(newestActivation(first, null)).toBe(first);
  });
});
