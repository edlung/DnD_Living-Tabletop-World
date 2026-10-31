import type { Deadline } from './deadline.ts';
import type { BillingDay, SessionClass } from './lock-keys.ts';
import type { WorkshopAiSubject } from '@ltw/contracts';

/**
 * Ports of the durable accounting store (docs/adr/0032-live-ai.md, amendment 2026-10-11;
 * docs/STAGE_300_REMEDIATION_DESIGN.md §1–2). Production uses PostgreSQL; nothing else is a
 * spending authority. Since checkpoint B2 every remote attempt is admitted, settled, released or
 * held through this port by the admission wrapper (`ai/admitted-provider.ts`).
 */

/**
 * Who an AI request is charged to. Runtime passes only a play session captured from the authorized
 * campaign snapshot; evaluation passes only an operator-registered run. The two never mix.
 */
export type AccountingSession =
  | { readonly class: 'play'; readonly sessionId: string }
  | { readonly class: 'evaluation'; readonly runId: string }
  | { readonly class: 'preparation'; readonly sessionId: string };

export const sessionKey = (
  session: AccountingSession,
): { sessionClass: SessionClass; sessionId: string } =>
  session.class === 'play'
    ? { sessionClass: 'play', sessionId: session.sessionId }
    : session.class === 'evaluation'
      ? { sessionClass: 'evaluation', sessionId: session.runId }
      : { sessionClass: 'preparation', sessionId: session.sessionId };

/** A durable request start: its ID is also the parent trace ID. */
export interface RequestStart {
  readonly requestId: string;
  readonly campaignId: string | null;
  readonly subject?: WorkshopAiSubject;
  readonly actorId: string;
  readonly purpose: string;
  readonly capability: string;
  readonly scope: string;
  readonly sourceIds: readonly string[];
  /** Null for a request that may only run locally. */
  readonly approvalId: string | null;
  readonly session: AccountingSession | null;
  readonly configuredModel: string | null;
}

export type AttemptKind = 'initial' | 'repair' | 'switch';

export interface AdmissionRequest {
  readonly requestId: string;
  readonly attemptId: string;
  readonly attemptKind: AttemptKind;
  readonly provider: string;
  readonly model: string;
  readonly pricingVersion: string;
  /** The worst-case charge of the exact prepared request, already computed; positive. */
  readonly reserveMicros: bigint;
}

export type DenialCode =
  'BUDGET_DENIED' | 'ADMISSION_DISABLED' | 'ADMISSION_UNAVAILABLE' | 'CALLER_CANCELLED';

/** Fixed diagnostic details; never campaign totals or remaining capacity. */
export type DenialDetail =
  | 'UNKNOWN_REQUEST'
  | 'NOT_ELIGIBLE'
  | 'CAMPAIGN_NOT_BOUND'
  | 'RUN_NOT_REGISTERED'
  | 'APPROVAL_DISABLED'
  | 'ACCOUNT_DISABLED'
  | 'STOPPED'
  | 'INVALID_RESERVATION'
  | 'GLOBAL_DAY'
  | 'CAMPAIGN_DAY'
  | 'STAGE'
  | 'SESSION'
  | 'STORAGE'
  /** COMMIT sent but unconfirmed: the reservation may exist. Never dispatch; never assume it absent. */
  | 'COMMIT_UNKNOWN';

export type AdmissionResult =
  | {
      readonly status: 'admitted';
      readonly attemptId: string;
      readonly billingDay: BillingDay;
      readonly reservedMicros: bigint;
    }
  | { readonly status: 'denied'; readonly code: DenialCode; readonly detail: DenialDetail };

/** Reasons an automatic restrictive stop is appended with accounting evidence. */
export type SuspectReason = 'UNEXPECTED_MODEL' | 'UNVERIFIED_BILLING';

export interface SettlementInput {
  readonly attemptId: string;
  /** Absolute charge from validated usage and the attempt's pricing version. */
  readonly chargeMicros: bigint;
  readonly usage: Readonly<Record<string, number>> | null;
  readonly returnedModel: string | null;
  readonly providerRequestId: string | null;
}

export type SettlementOutcome = 'settled' | 'evidence' | 'duplicate' | 'absent';
export type ReleaseOutcome = 'released' | 'already-terminal' | 'absent';

export interface BudgetStore {
  /** Reserves the bound across every ceiling, or denies; bounded by the request's deadline. */
  admit(request: AdmissionRequest, requestDeadline: Deadline): Promise<AdmissionResult>;
  /** Idempotent; a second terminal becomes non-reducing evidence. Fixed 5,000 ms bound. */
  settle(input: SettlementInput): Promise<SettlementOutcome>;
  /** Only with the live process's proof that transport never started. */
  releasePreDispatch(attemptId: string): Promise<ReleaseOutcome>;
  /**
   * Keeps the full hold and stops the account's provider/model until an operator clears it.
   * Idempotent per attempt and reason, so it may be retried.
   */
  holdWithStop(
    attemptId: string,
    reason: SuspectReason,
    returnedModel: string | null,
  ): Promise<void>;
  /** Records the provider's request/message ID of an attempt (idempotent). Fixed 5,000 ms bound. */
  recordResponse(
    attemptId: string,
    providerRequestId: string,
    returnedModel: string | null,
  ): Promise<void>;
}

/** A refusal with a fixed reason; never echoes input values. */
export class AccountingRejection extends Error {
  readonly code: string;

  constructor(code: string, message: string = code) {
    super(message);
    this.name = 'AccountingRejection';
    this.code = code;
  }
}

/** Recorded owner spending authorization, required on every operator record. */
export interface Authorization {
  readonly ownerId: string;
  /** `YYYY-MM-DD`. */
  readonly authorizedOn: string;
  /** Durable reference to the explicit owner authorization. */
  readonly source: string;
}
