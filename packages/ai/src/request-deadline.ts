/**
 * The whole-request deadline (docs/STAGE_300_REMEDIATION_DESIGN.md §1; docs/adr/0032-live-ai.md,
 * B2). Each AI use case creates exactly one, before its request start, from the process's monotonic
 * timer, so wall-clock skew never extends it. Its signal aborts at expiry and travels through the
 * request start, every admission, attempt and persistence wait. There is no zero or unbounded mode:
 * an invalid duration is a construction error.
 */
export interface RequestDeadline {
  /** `performance.now()` milliseconds at which the request expires. */
  readonly atMs: number;
  /** Aborted at expiry, or when the request is over. */
  readonly signal: AbortSignal;
}

export interface OpenDeadline {
  readonly deadline: RequestDeadline;
  /** Ends the request's lifetime: clears the timer and aborts anything still running. */
  readonly close: () => void;
}

/** Thrown for a missing or invalid whole-request duration. */
export class DeadlineConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeadlineConfigError';
  }
}

export function openDeadline(durationMs: number): OpenDeadline {
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new DeadlineConfigError('a whole-request deadline needs a positive integer duration');
  }
  const controller = new AbortController();
  const atMs = performance.now() + durationMs;
  const timer = setTimeout(() => {
    controller.abort();
  }, durationMs);
  return {
    deadline: { atMs, signal: controller.signal },
    close: () => {
      clearTimeout(timer);
      controller.abort();
    },
  };
}

/** Whether the request is over: its signal aborted, or its monotonic time ran out. */
export const isExpired = (deadline: RequestDeadline): boolean =>
  deadline.signal.aborted || performance.now() >= deadline.atMs;

export const EXPIRED: unique symbol = Symbol('expired');

/**
 * Waits for `work` no later than the deadline. A rejection before it propagates; anything that
 * settles afterwards is ignored (never an unhandled rejection).
 */
export function untilDeadline<T>(
  work: Promise<T>,
  deadline: RequestDeadline,
): Promise<T | typeof EXPIRED> {
  work.catch(() => undefined);
  if (isExpired(deadline)) return Promise.resolve(EXPIRED);
  const expiry = new Promise<typeof EXPIRED>((resolve) => {
    deadline.signal.addEventListener(
      'abort',
      () => {
        resolve(EXPIRED);
      },
      { once: true },
    );
  });
  return Promise.race([work, expiry]);
}
