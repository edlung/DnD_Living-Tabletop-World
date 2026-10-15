/**
 * The DM's accounting diagnostic for one AI request (docs/adr/0032-live-ai.md, B2;
 * `GET /campaigns/:campaignId/ai/accounting/:traceId`, DM only). Read-only: it is never an
 * authoring source and never changes a trace. It shows only this campaign's request and its
 * attempts: never bucket totals, remaining capacity, approvals, stops or another campaign's data.
 * Amounts are integer microdollars as decimal strings.
 */

/**
 * `pending`: no caller outcome yet (the finalizer may still record it, or recovery will).
 * `recorded`: the live outcome and its trace were stored together.
 * `recovered_incomplete`: the finalizer window closed with no outcome. Whether the result reached
 * the caller is unknowable; no trace exists or will exist, and the normal trace read stays 404.
 */
export type AiRequestLifecycle = 'pending' | 'recorded' | 'recovered_incomplete';

export interface AccountingAttemptView {
  readonly attemptId: string;
  readonly attemptKind: 'initial' | 'repair' | 'switch';
  readonly provider: string;
  /** The canonical model the attempt was admitted for. */
  readonly model: string;
  readonly pricingVersion: string;
  readonly reservedMicros: string;
  /**
   * `open`: no terminal accounting; the full reservation (or larger evidence) stays charged.
   * The others are the one terminal accounting row of the attempt.
   */
  readonly accounting: 'open' | 'settled' | 'released_pre_dispatch' | 'reconciled';
  /** What the attempt currently counts against its ceilings. */
  readonly effectiveMicros: string;
  readonly returnedModel: string | null;
  readonly providerRequestId: string | null;
}

export interface AiAccountingDiagnosticView {
  readonly traceId: string;
  readonly campaignId: string;
  readonly purpose: string;
  readonly capability: string;
  readonly configuredModel: string | null;
  readonly createdAt: string;
  readonly deadlineAt: string;
  readonly lifecycle: AiRequestLifecycle;
  /** The recorded caller outcome; null while pending and for recovered requests. */
  readonly callerOutcome: {
    readonly status: string;
    readonly provider: string | null;
    readonly code: string | null;
  } | null;
  /** Whether the normal trace exists. False while pending, and forever once recovered. */
  readonly traceRecorded: boolean;
  /** True until both the caller outcome and every attempt's terminal accounting are recorded. */
  readonly incomplete: boolean;
  readonly attempts: readonly AccountingAttemptView[];
}
