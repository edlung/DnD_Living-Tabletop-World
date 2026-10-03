import { describe, expect, it } from 'vitest';

import { REDACTED, createLogger } from './logger.ts';

function captureLogger(level: 'info' | 'debug' | 'silent' = 'info') {
  const lines: Record<string, unknown>[] = [];
  const destination = {
    write(chunk: string) {
      lines.push(JSON.parse(chunk) as Record<string, unknown>);
    },
  };
  const logger = createLogger({ service: 'test-service', level, destination });
  return { logger, lines };
}

describe('createLogger', () => {
  it('emits one JSON object per entry with service, level label, ISO time, and message', () => {
    const { logger, lines } = captureLogger();

    logger.info({ requestId: 'req-1' }, 'hello');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      service: 'test-service',
      level: 'info',
      requestId: 'req-1',
      msg: 'hello',
    });
    expect(new Date(String(lines[0]?.['time'])).toISOString()).toBe(lines[0]?.['time']);
  });

  it('carries child bindings', () => {
    const { logger, lines } = captureLogger();

    logger.child({ module: 'db' }).info('migrated');

    expect(lines[0]).toMatchObject({ module: 'db', msg: 'migrated' });
  });

  it('respects the configured level', () => {
    const { logger, lines } = captureLogger('info');

    logger.debug('hidden');
    logger.warn('shown');

    expect(lines.map((line) => line['msg'])).toEqual(['shown']);
  });

  it('emits nothing when silent', () => {
    const { logger, lines } = captureLogger('silent');

    logger.fatal('nothing');

    expect(lines).toHaveLength(0);
  });

  it('redacts sensitive fields at the top level and one level deep', () => {
    const { logger, lines } = captureLogger();

    logger.info(
      {
        password: 'p1',
        databaseUrl: 'postgres://u:p2@h/db',
        db: { connectionString: 'postgres://u:p3@h/db' },
        provider: { apiKey: 'k1' },
        req: { headers: { authorization: 'Bearer t1' } },
        safe: 'visible',
      },
      'redaction',
    );

    const serialized = JSON.stringify(lines[0]);
    for (const secret of ['p1', 'p2', 'p3', 'k1', 't1']) {
      expect(serialized).not.toContain(secret);
    }
    expect(lines[0]).toMatchObject({ password: REDACTED, safe: 'visible' });
  });
});
