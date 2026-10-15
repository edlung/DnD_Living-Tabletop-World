import {
  ProviderError,
  failureCode,
  type AdmittedProvider,
  type AttemptCharge,
  type AttemptContext,
  type DenialCode,
  type ProviderRequest,
  type ProviderResponse,
  type RequestAccounting,
} from '@ltw/ai';

import type { AccountingTasks } from './accounting-tasks.ts';
import type { AttemptKind, BudgetStore } from './accounting/types.ts';
import type { CatalogEntry } from './catalog.ts';
import { priceUsage, reservationFor } from './pricing.ts';
import type { RawRemoteProvider } from './raw-provider.ts';

/**
 * The admission wrapper (docs/STAGE_300_REMEDIATION_DESIGN.md §1–3; docs/adr/0032-live-ai.md, B2):
 * the only way a raw remote adapter can be dispatched, and the only maker of `AdmittedProvider`s.
 * Each attempt, in order:
 *
 * 1. Trusted identity: the request's accounting metadata (from the use case and the fallback
 *    policy, never a player) must name a request, an attempt and a play session; the whole-request
 *    deadline must be finite. Otherwise the attempt is denied before anything else.
 * 2. `prepare` builds the exact body (no transport, no key). Its reservation is computed from that
 *    body and the verified catalog entry (`pricing.ts`); a body outside the entry's allowlists or
 *    limits is denied (`ADMISSION_DISABLED`).
 * 3. Durable admission reserves the bound across every ceiling in one transaction with the
 *    attempt-start row, within the request's deadline. A denial dispatches nothing.
 * 4. Dispatch of that same prepared body. `onStart` marks the start boundary; only a failure
 *    strictly before it releases the hold (live proof of `TRANSPORT_NOT_STARTED`). Any other
 *    failure keeps the full hold for the operator.
 * 5. The response: its provider request ID recorded when it has one; known usage priced and
 *    settled (in the background, retried); absent usage keeps the hold; an unexpected model or
 *    unverified billing keeps the hold, stops the route (at the attempt's canonical model; the
 *    returned string is only observed; the stop write retried, the route refused in this process
 *    until it commits) and discards the output.
 *
 * The caller has gone when its signal has aborted or the monotonic clock has reached the request's
 * deadline (B2 repair 1). Past it, nothing is admitted or dispatched; an admission that committed
 * anyway is released live, since this process knows its transport never started.
 *
 * Advisory A1 decision: a progress listener that throws inside the start hook neither stops the
 * transport nor this wrapper's accounting. The paid call proceeds, its usage is settled here, and
 * the fallback policy records the attempt and then propagates the listener's error.
 *
 * Wrappers are frozen with data properties and registered by identity in a module-private set;
 * composition (`composition.ts`) refuses anything else, whatever its TypeScript brand.
 */
const admitted = new WeakSet<object>();

export const isAdmittedProvider = (provider: unknown): boolean =>
  typeof provider === 'object' && provider !== null && admitted.has(provider);

export interface AdmissionDeps {
  readonly store: BudgetStore;
  readonly entry: CatalogEntry;
  readonly tasks: AccountingTasks;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KINDS: Readonly<Record<RequestAccounting['attemptKind'], AttemptKind>> = {
  initial: 'initial',
  repair: 'repair',
  fallback: 'switch',
};

/** The trusted identity, copied once, or null when it is not one this wrapper can account for. */
function identityOf(request: ProviderRequest): (RequestAccounting & { kind: AttemptKind }) | null {
  try {
    const { requestId, campaignId, capability, sessionId, attemptId, attemptKind } =
      request.accounting;
    const kind = Object.hasOwn(KINDS, attemptKind) ? KINDS[attemptKind] : undefined;
    if (!UUID.test(requestId) || !UUID.test(attemptId) || kind === undefined) return null;
    if (typeof sessionId !== 'string' || sessionId === '') return null;
    return { requestId, campaignId, capability, sessionId, attemptId, attemptKind, kind };
  } catch {
    return null;
  }
}

const denied = (code: DenialCode): ProviderResponse => ({
  kind: 'denied',
  code,
});

export function admittedProvider(raw: RawRemoteProvider, deps: AdmissionDeps): AdmittedProvider {
  const { store, entry, tasks } = deps;
  if (raw.id !== entry.provider)
    throw new Error('an admitted provider must match its catalog entry');

  async function generate(
    request: ProviderRequest,
    attempt: AttemptContext,
  ): Promise<ProviderResponse> {
    // A function, not a narrowed property: the caller may go while admission is awaited. The
    // monotonic deadline is read as well as the signal, whose timer can run late (B2 repair 1).
    const callerGone = () => attempt.signal.aborted || performance.now() >= attempt.deadlineAtMs;
    const identity = identityOf(request);
    if (identity === null) return denied('ADMISSION_DISABLED');
    if (!Number.isFinite(attempt.deadlineAtMs)) return denied('ADMISSION_UNAVAILABLE');
    if (callerGone()) {
      throw new ProviderError('TRANSPORT_NOT_STARTED', 'caller cancelled before admission');
    }
    // A stop this process is still writing for this route: refused here, as the stop will be.
    if (tasks.refuses(entry.provider, entry.model)) return denied('ADMISSION_DISABLED');
    let prepared;
    try {
      prepared = raw.prepare(request);
    } catch {
      throw new ProviderError('TRANSPORT_NOT_STARTED', 'request could not be prepared');
    }
    const reservation = reservationFor(entry, prepared);
    if (!reservation.ok) return denied('ADMISSION_DISABLED');

    const admission = await store.admit(
      {
        requestId: identity.requestId,
        attemptId: identity.attemptId,
        attemptKind: identity.kind,
        provider: entry.provider,
        model: entry.model,
        pricingVersion: entry.pricing.version,
        reserveMicros: reservation.micros,
      },
      { atMs: attempt.deadlineAtMs },
    );
    if (admission.status === 'denied') {
      // A cancelled admission is never dispatched; a possible hold (unknown COMMIT) stays.
      return denied(
        admission.code === 'CALLER_CANCELLED' ? 'ADMISSION_UNAVAILABLE' : admission.code,
      );
    }

    const { attemptId } = identity;
    const release = () => {
      tasks.run('RELEASE_FAILED', () => store.releasePreDispatch(attemptId));
    };
    const charged = (cost: bigint | null): AttemptCharge => ({
      pricingVersion: entry.pricing.version,
      reservedMicros: reservation.micros.toString(),
      costMicros: cost === null ? null : cost.toString(),
    });
    // An admission that commits after the deadline is never dispatched: this live process knows
    // transport never started, so the hold is released now.
    if (callerGone()) {
      release();
      throw new ProviderError('TRANSPORT_NOT_STARTED', 'caller cancelled before dispatch');
    }

    const boundary = { started: false };
    let response: ProviderResponse;
    try {
      response = await raw.dispatch(
        prepared,
        attempt.signal,
        () => {
          boundary.started = true;
          try {
            attempt.onStart();
          } catch {
            // A1: the listener's failure is the caller's to report; transport and accounting go on.
          }
        },
        attempt.deadlineAtMs,
      );
    } catch (error) {
      if (!boundary.started && failureCode(error) === 'TRANSPORT_NOT_STARTED') release();
      throw error;
    }

    if (response.kind === 'denied') {
      // Not something an adapter answers: an uncertain attempt, its hold kept.
      throw new ProviderError('BAD_RESPONSE', 'provider resolved no response');
    }
    // The provider's request ID is recorded for every response that has one (design §2).
    if (response.providerRequestId !== null) {
      tasks.recordResponse(store, attemptId, response.providerRequestId, response.model);
    }
    const stop = (reason: 'UNEXPECTED_MODEL' | 'UNVERIFIED_BILLING') => {
      tasks.holdWithStop(store, {
        attemptId,
        reason,
        returnedModel: response.model,
        provider: entry.provider,
        model: entry.model,
      });
    };
    if (response.kind === 'suspect') {
      stop(response.code);
      return { ...response, charge: charged(null) };
    }
    const priced = priceUsage(entry, response);
    if (priced.kind === 'unverified') {
      stop('UNVERIFIED_BILLING');
      const { model, usage, billing, providerRequestId } = response;
      return {
        kind: 'suspect',
        code: 'UNVERIFIED_BILLING',
        model,
        usage,
        billing,
        providerRequestId,
        charge: charged(null),
      };
    }
    if (priced.kind === 'missing') return { ...response, charge: charged(null) };
    tasks.settle(store, {
      attemptId,
      chargeMicros: priced.micros,
      usage: priced.usage,
      returnedModel: response.model,
      providerRequestId: response.providerRequestId,
    });
    return { ...response, charge: charged(priced.micros) };
  }

  const provider = Object.freeze({ id: entry.provider, kind: 'remote' as const, generate });
  admitted.add(provider);
  return provider as unknown as AdmittedProvider;
}
