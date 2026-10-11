import type {
  AdmissionRequest,
  AdmissionResult,
  BudgetStore,
  ReleaseOutcome,
  SettlementInput,
  SettlementOutcome,
  SuspectReason,
} from '../ai/accounting/types.ts';

/**
 * Test support: a scripted, in-memory `BudgetStore` that records every call in order
 * (docs/adr/0032-live-ai.md, B2). Never a spending authority: production uses PostgreSQL only.
 * `decide` answers each admission (default: admit).
 */
export type StoreCall =
  | { readonly kind: 'admit'; readonly request: AdmissionRequest; readonly deadlineAtMs: number }
  | { readonly kind: 'settle'; readonly input: SettlementInput }
  | { readonly kind: 'release'; readonly attemptId: string }
  | {
      readonly kind: 'hold';
      readonly attemptId: string;
      readonly reason: SuspectReason;
      readonly returnedModel: string | null;
    }
  | {
      readonly kind: 'response';
      readonly attemptId: string;
      readonly providerRequestId: string;
      readonly returnedModel: string | null;
    };

export interface FakeBudgetStore extends BudgetStore {
  readonly calls: StoreCall[];
}

export function fakeBudgetStore(
  options: {
    readonly decide?: (request: AdmissionRequest) => AdmissionResult | Promise<AdmissionResult>;
    /** Settlement answers or failures, in order; then `settled`. */
    readonly settle?: (input: SettlementInput) => Promise<SettlementOutcome>;
    /** Called inside `admit`, after the call is recorded (to interleave events in tests). */
    readonly onAdmit?: () => void;
    /** Each stop write's answer (for example a transient failure); default: committed. */
    readonly holdWithStop?: (attemptId: string, reason: SuspectReason) => Promise<void>;
  } = {},
): FakeBudgetStore {
  const calls: StoreCall[] = [];
  return {
    calls,
    admit: async (request, deadline) => {
      calls.push({ kind: 'admit', request, deadlineAtMs: deadline.atMs });
      options.onAdmit?.();
      return (
        (await options.decide?.(request)) ?? {
          status: 'admitted',
          attemptId: request.attemptId,
          billingDay: '2026-10-11',
          reservedMicros: request.reserveMicros,
        }
      );
    },
    settle: (input) => {
      calls.push({ kind: 'settle', input });
      return options.settle?.(input) ?? Promise.resolve('settled');
    },
    releasePreDispatch: (attemptId): Promise<ReleaseOutcome> => {
      calls.push({ kind: 'release', attemptId });
      return Promise.resolve('released');
    },
    holdWithStop: (attemptId, reason, returnedModel) => {
      calls.push({ kind: 'hold', attemptId, reason, returnedModel });
      return options.holdWithStop?.(attemptId, reason) ?? Promise.resolve();
    },
    recordResponse: (attemptId, providerRequestId, returnedModel) => {
      calls.push({ kind: 'response', attemptId, providerRequestId, returnedModel });
      return Promise.resolve();
    },
  };
}
