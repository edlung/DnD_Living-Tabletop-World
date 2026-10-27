import type { Logger } from '../logging/logger.ts';

/**
 * Readiness (docs/adr/0037-deployment.md §3): whether this process can serve, beyond being alive
 * (`/healthz`). The deployment's health checks and the proxy's start wait for it. A check
 * resolves when it holds and throws when it does not; only the names of failed checks leave the
 * probe, never error text (it may carry connection details), which goes to the log instead.
 */
export const READINESS_CHECKS = ['database', 'migrations', 'eventStore'] as const;
export type ReadinessCheck = (typeof READINESS_CHECKS)[number];

export interface Readiness {
  readonly ready: boolean;
  readonly failed: readonly ReadinessCheck[];
}

export type ReadinessProbe = () => Promise<Readiness>;

export type ReadinessChecks = Readonly<Record<ReadinessCheck, () => Promise<void>>>;

/** A composition without external stores (tests, in-memory journeys): ready while it runs. */
export const processReadiness: ReadinessProbe = () => Promise.resolve({ ready: true, failed: [] });

export const DEFAULT_CHECK_TIMEOUT_MS = 3_000;

export class ReadinessTimeout extends Error {
  constructor() {
    super('readiness check timed out');
    this.name = 'ReadinessTimeout';
  }
}

/**
 * Runs every check concurrently, each bounded by `timeoutMs`. Concurrent callers share one run,
 * so probes cannot pile up on a slow database. Changes of the verdict are logged once (failed
 * checks with their errors at `warn`, recovery at `info`); a steady state logs nothing.
 */
export function readinessProbe(
  checks: ReadinessChecks,
  options: { readonly logger: Logger; readonly timeoutMs?: number },
): ReadinessProbe {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  let running: Promise<Readiness> | null = null;
  let previous: string | null = null;

  const run = async (): Promise<Readiness> => {
    const outcomes = await Promise.all(
      READINESS_CHECKS.map(async (name) => {
        try {
          await bounded(checks[name](), timeoutMs);
          return { name, error: null };
        } catch (error: unknown) {
          return { name, error };
        }
      }),
    );
    const failed = outcomes.filter((outcome) => outcome.error !== null);
    const readiness: Readiness = {
      ready: failed.length === 0,
      failed: failed.map((outcome) => outcome.name),
    };
    const verdict = readiness.failed.join(',');
    if (verdict !== previous) {
      previous = verdict;
      if (readiness.ready) {
        options.logger.info('ready');
      } else {
        for (const { name, error } of failed) {
          options.logger.warn({ check: name, err: error }, 'not ready');
        }
      }
    }
    return readiness;
  };

  return () =>
    (running ??= run().finally(() => {
      running = null;
    }));
}

function bounded(work: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new ReadinessTimeout());
    }, timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer);
  });
}
