import { describe, expect, it } from 'vitest';

import { createLogger } from '../logging/logger.ts';
import { processReadiness, readinessProbe, type ReadinessChecks } from './readiness.ts';

/** The readiness probe's verdicts, bounds, sharing and logging (docs/adr/0037-deployment.md §3). */
function capture() {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({
    service: 'readiness-test',
    level: 'debug',
    destination: {
      write: (chunk: string) => lines.push(JSON.parse(chunk) as Record<string, unknown>),
    },
  });
  return { lines, logger };
}

const passing = (): Promise<void> => Promise.resolve();
const checks = (overrides: Partial<ReadinessChecks> = {}): ReadinessChecks => ({
  database: passing,
  migrations: passing,
  eventStore: passing,
  ...overrides,
});

describe('readinessProbe', () => {
  it('is ready when every check holds, and logs the first verdict only once', async () => {
    const { lines, logger } = capture();
    const probe = readinessProbe(checks(), { logger });

    expect(await probe()).toEqual({ ready: true, failed: [] });
    expect(await probe()).toEqual({ ready: true, failed: [] });
    expect(lines.map((line) => [line['level'], line['msg']])).toEqual([['info', 'ready']]);
  });

  it('names only the failed checks; their errors go to the log, never to the verdict', async () => {
    const { lines, logger } = capture();
    const probe = readinessProbe(
      checks({
        database: () => Promise.reject(new Error('connect ECONNREFUSED postgres://db:5432')),
        eventStore: () => {
          throw new Error('unknown event type');
        },
      }),
      { logger },
    );

    const verdict = await probe();
    expect(verdict).toEqual({ ready: false, failed: ['database', 'eventStore'] });
    expect(JSON.stringify(verdict)).not.toContain('ECONNREFUSED');
    expect(lines.map((line) => [line['level'], line['check'], line['msg']])).toEqual([
      ['warn', 'database', 'not ready'],
      ['warn', 'eventStore', 'not ready'],
    ]);
    expect(JSON.stringify(lines)).toContain('unknown event type');
  });

  it('bounds a check that never answers', async () => {
    const { logger } = capture();
    const probe = readinessProbe(checks({ migrations: () => new Promise<void>(() => undefined) }), {
      logger,
      timeoutMs: 20,
    });

    expect(await probe()).toEqual({ ready: false, failed: ['migrations'] });
  });

  it('shares one run between concurrent callers', async () => {
    const { logger } = capture();
    let runs = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const probe = readinessProbe(
      checks({
        database: async () => {
          runs += 1;
          await gate;
        },
      }),
      { logger },
    );

    const first = probe();
    const second = probe();
    release();
    expect(await Promise.all([first, second])).toEqual([
      { ready: true, failed: [] },
      { ready: true, failed: [] },
    ]);
    expect(runs).toBe(1);
    await probe();
    expect(runs).toBe(2);
  });

  it('logs a recovery once the failed check holds again', async () => {
    const { lines, logger } = capture();
    let down = true;
    const probe = readinessProbe(
      checks({ database: () => (down ? Promise.reject(new Error('down')) : Promise.resolve()) }),
      { logger },
    );

    expect((await probe()).ready).toBe(false);
    expect((await probe()).ready).toBe(false);
    down = false;
    expect((await probe()).ready).toBe(true);
    expect(lines.map((line) => line['msg'])).toEqual(['not ready', 'ready']);
  });

  it('treats a composition without external stores as ready', async () => {
    expect(await processReadiness()).toEqual({ ready: true, failed: [] });
  });
});
