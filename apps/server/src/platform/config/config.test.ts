import { describe, expect, it } from 'vitest';

import {
  ConfigError,
  DEFAULT_PERSONAS_FILE,
  DEV_DATABASE_URL,
  describeDatabaseUrl,
  loadConfig,
} from './config.ts';

describe('loadConfig', () => {
  it('applies safe development defaults when nothing is set', () => {
    const config = loadConfig({});

    expect(config).toEqual({
      nodeEnv: 'development',
      logLevel: 'debug',
      http: { host: '127.0.0.1', port: 3000 },
      databaseUrl: DEV_DATABASE_URL,
      auth: { mode: 'dev-personas', personasFile: DEFAULT_PERSONAS_FILE },
    });
    expect(DEFAULT_PERSONAS_FILE).toMatch(/fixtures\/ravenford\/personas\.json$/);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.http)).toBe(true);
  });

  it('silences logs by default in test', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).logLevel).toBe('silent');
  });

  it('reads explicit values and coerces the port', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      HTTP_HOST: '0.0.0.0',
      HTTP_PORT: '8080',
      DATABASE_URL: 'postgresql://app:secret@db.internal:5432/ltw',
    });

    expect(config.nodeEnv).toBe('production');
    expect(config.logLevel).toBe('warn');
    expect(config.http).toEqual({ host: '0.0.0.0', port: 8080 });
    expect(config.databaseUrl).toBe('postgresql://app:secret@db.internal:5432/ltw');
  });

  it('treats empty strings as unset', () => {
    expect(loadConfig({ NODE_ENV: '', HTTP_PORT: '', LOG_LEVEL: '' }).http.port).toBe(3000);
  });

  it('disables development personas in production and refuses to enable them', () => {
    const production = { NODE_ENV: 'production', DATABASE_URL: 'postgres://app:pw@db/ltw' };
    expect(loadConfig(production).auth).toEqual({ mode: 'disabled', personasFile: null });
    expect(() => loadConfig({ ...production, AUTH_MODE: 'dev-personas' })).toThrow(
      /AUTH_MODE: dev-personas is not allowed in production/,
    );
    expect(loadConfig({ AUTH_MODE: 'disabled' }).auth.personasFile).toBeNull();
    expect(loadConfig({ DEV_PERSONAS_FILE: '/tmp/p.json' }).auth.personasFile).toBe('/tmp/p.json');
  });

  it('requires DATABASE_URL in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL: required/);
  });

  it('rejects development credentials in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: DEV_DATABASE_URL })).toThrow(
      /development default credentials/,
    );
  });

  it.each([
    [{ NODE_ENV: 'staging' }, 'NODE_ENV'],
    [{ LOG_LEVEL: 'verbose' }, 'LOG_LEVEL'],
    [{ HTTP_PORT: '70000' }, 'HTTP_PORT'],
    [{ HTTP_PORT: 'abc' }, 'HTTP_PORT'],
    [{ DATABASE_URL: 'mysql://user:pw@host/db' }, 'DATABASE_URL'],
    [{ DATABASE_URL: 'not a url' }, 'DATABASE_URL'],
  ])('rejects invalid input %o', (env, variable) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
    try {
      loadConfig(env);
    } catch (error) {
      expect((error as ConfigError).issues.some((issue) => issue.startsWith(variable))).toBe(true);
    }
  });

  it('never echoes the offending value in error messages', () => {
    const secret = 'mysql://user:TOP_SECRET_PASSWORD@host/db';
    try {
      loadConfig({ DATABASE_URL: secret });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain('TOP_SECRET_PASSWORD');
    }
  });
});

describe('describeDatabaseUrl', () => {
  it('drops credentials', () => {
    expect(describeDatabaseUrl('postgres://user:pw@db.internal:5432/ltw')).toBe(
      'postgres://db.internal:5432/ltw',
    );
  });
});
