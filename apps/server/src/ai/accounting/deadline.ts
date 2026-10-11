/**
 * Monotonic deadlines (docs/STAGE_300_REMEDIATION_DESIGN.md §1). Measured with the process's
 * monotonic timer, so wall-clock skew never extends a wait. A storage step is bounded by
 * MIN(remaining whole-request time, 5,000 ms); work outside a caller's lifetime (settlement,
 * release, recovery, operator) gets a fixed 5,000 ms.
 */
export const STORAGE_STEP_MS = 5_000;

export interface Deadline {
  /** `performance.now()` value at which the time is up. */
  readonly atMs: number;
}

export const deadlineIn = (ms: number, now: number = performance.now()): Deadline => ({
  atMs: now + ms,
});

export const remainingMs = (deadline: Deadline, now: number = performance.now()): number =>
  deadline.atMs - now;

export const expired = (deadline: Deadline, now: number = performance.now()): boolean =>
  remainingMs(deadline, now) <= 0;

/** The bound for one storage step inside a request: never later than the request itself. */
export const storageStep = (request: Deadline, now: number = performance.now()): Deadline => ({
  atMs: Math.min(request.atMs, now + STORAGE_STEP_MS),
});

/** The fixed bound for a transaction outside the caller's lifetime. */
export const fixedStep = (now: number = performance.now()): Deadline =>
  deadlineIn(STORAGE_STEP_MS, now);
