import { describe, expect, it } from 'vitest';

import { createLogger } from '../logging/logger.ts';
import { createPool } from './pool.ts';

/** A database restart must not end the server (docs/adr/0037-deployment.md). */
describe('createPool', () => {
  it('logs a lost idle connection by code and message instead of ending the process', async () => {
    const lines: Record<string, unknown>[] = [];
    const logger = createLogger({
      service: 'pool-test',
      level: 'info',
      destination: {
        write: (chunk: string) => lines.push(JSON.parse(chunk) as Record<string, unknown>),
      },
    });
    // Nothing connects: the URL is never dialled by this test.
    const pool = createPool('postgres://ltw:unused@127.0.0.1:1/ltw', logger, { max: 1 });
    const lost = Object.assign(new Error('terminating connection due to administrator command'), {
      code: '57P01',
      client: { connectionParameters: { user: 'ltw', password: 'never-logged' } },
    });

    expect(() => pool.emit('error', lost)).not.toThrow();
    expect(lines).toEqual([
      expect.objectContaining({
        level: 'warn',
        code: '57P01',
        reason: 'terminating connection due to administrator command',
        msg: 'database connection lost; the pool reconnects on demand',
      }),
    ]);
    expect(JSON.stringify(lines)).not.toContain('never-logged');
    await pool.end();
  });
});
