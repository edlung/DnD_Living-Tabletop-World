import { createHash } from 'node:crypto';
import { accountingSubjectKey, type AccountingSubject } from './subjects.ts';

/**
 * Advisory lock namespaces of the accounting store (docs/adr/0032-live-ai.md, amendment
 * 2026-10-11). Policy is `-1`; buckets and billing-account control are nonnegative 63-bit keys;
 * requests are `-2 - unsigned62(hash)`, so the three never collide. (The migrator's key is also
 * nonnegative: a collision with a bucket only serializes, it never admits extra spending. Authoring
 * locks use the separate two-integer namespace.)
 */
export const POLICY_LOCK_KEY = -1n;

/** A UTC day, `YYYY-MM-DD`, as the database reports it. */
export type BillingDay = string;

export type SessionClass = 'play' | 'evaluation' | 'preparation';

export type Bucket =
  | { readonly kind: 'account-control'; readonly accountId: string }
  | { readonly kind: 'global-day'; readonly accountId: string; readonly day: BillingDay }
  | { readonly kind: 'campaign-day'; readonly campaignId: string; readonly day: BillingDay }
  | { readonly kind: 'stage'; readonly approvalId: string }
  | { readonly kind: 'subject-day'; readonly subjectKey: string; readonly day: BillingDay }
  | {
      readonly kind: 'preparation-session';
      readonly approvalId: string;
      readonly subjectKey: string;
      readonly sessionId: string;
    }
  | {
      readonly kind: 'session';
      readonly approvalId: string;
      readonly campaignId: string;
      readonly sessionClass: SessionClass;
      readonly sessionId: string;
    };

const MASK_62 = (1n << 62n) - 1n;
const MASK_63 = (1n << 63n) - 1n;

const hash64 = (text: string): bigint =>
  createHash('sha256').update(text).digest().readBigUInt64BE(0);

/** Unambiguous bucket identity: a JSON array of its kind and fields. */
function identity(bucket: Bucket): string {
  switch (bucket.kind) {
    case 'account-control':
      return JSON.stringify([bucket.kind, bucket.accountId]);
    case 'global-day':
      return JSON.stringify([bucket.kind, bucket.accountId, bucket.day]);
    case 'campaign-day':
      return JSON.stringify([bucket.kind, bucket.campaignId, bucket.day]);
    case 'stage':
      return JSON.stringify([bucket.kind, bucket.approvalId]);
    case 'subject-day':
      return JSON.stringify([bucket.kind, bucket.subjectKey, bucket.day]);
    case 'preparation-session':
      return JSON.stringify([bucket.kind, bucket.approvalId, bucket.subjectKey, bucket.sessionId]);
    case 'session':
      return JSON.stringify([
        bucket.kind,
        bucket.approvalId,
        bucket.campaignId,
        bucket.sessionClass,
        bucket.sessionId,
      ]);
  }
}

export const bucketLockKey = (bucket: Bucket): bigint => hash64(identity(bucket)) & MASK_63;

export const requestLockKey = (requestId: string): bigint =>
  -2n - (hash64(JSON.stringify(['request', requestId])) & MASK_62);

/** Deduplicated and sorted numerically: the one acquisition order for every transaction. */
export function sortedLockKeys(buckets: readonly Bucket[]): bigint[] {
  return [...new Set(buckets.map(bucketLockKey))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The attributes an attempt is charged under, persisted with it at admission. */
export interface AttemptScope extends AccountingSubject {
  readonly accountId: string;
  readonly approvalId: string;
  readonly sessionClass: SessionClass;
  readonly sessionId: string;
  readonly day: BillingDay;
}

/** Every lock an admission, settlement or release of that scope takes, besides the policy lock. */
export const scopeBuckets = (scope: AttemptScope): Bucket[] =>
  scope.campaignId === null
    ? [
        { kind: 'account-control', accountId: scope.accountId },
        { kind: 'global-day', accountId: scope.accountId, day: scope.day },
        { kind: 'subject-day', subjectKey: accountingSubjectKey(scope), day: scope.day },
        { kind: 'stage', approvalId: scope.approvalId },
        {
          kind: 'preparation-session',
          approvalId: scope.approvalId,
          subjectKey: accountingSubjectKey(scope),
          sessionId: scope.sessionId,
        },
      ]
    : [
        { kind: 'account-control', accountId: scope.accountId },
        { kind: 'global-day', accountId: scope.accountId, day: scope.day },
        { kind: 'campaign-day', campaignId: scope.campaignId, day: scope.day },
        { kind: 'stage', approvalId: scope.approvalId },
        {
          kind: 'session',
          approvalId: scope.approvalId,
          campaignId: scope.campaignId,
          sessionClass: scope.sessionClass,
          sessionId: scope.sessionId,
        },
      ];
