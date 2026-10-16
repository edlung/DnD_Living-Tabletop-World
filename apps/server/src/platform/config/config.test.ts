import { describe, expect, it } from 'vitest';

import { inspect } from 'node:util';

import {
  ConfigError,
  DEFAULT_AI_MODEL,
  DEFAULT_PERSONAS_FILE,
  DEFAULT_QUESTS_FILE,
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
      http: { host: '127.0.0.1', port: 3000, trustedProxies: [] },
      databaseUrl: DEV_DATABASE_URL,
      auth: { mode: 'dev-personas', personasFile: DEFAULT_PERSONAS_FILE },
      ai: {
        anthropic: null,
        relevanceBudgetMs: 2_000,
        requestTimeoutMs: 60_000,
        approvalId: null,
        deepseek: null,
        routes: null,
      },
      questsFile: DEFAULT_QUESTS_FILE,
      allowNewerSchema: false,
      assets: {
        workerIntervalMs: 5_000,
        generationTimeoutMs: 60_000,
        generator: { kind: 'placeholder' },
      },
    });
    expect(DEFAULT_QUESTS_FILE).toMatch(/fixtures\/ravenford\/quests\.json$/);
    expect(loadConfig({ LTW_QUESTS_FILE: '/tmp/quests.json' }).questsFile).toBe('/tmp/quests.json');
    expect(DEFAULT_PERSONAS_FILE).toMatch(/fixtures\/ravenford\/personas\.json$/);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.http)).toBe(true);
  });

  it('reads the asset worker settings, where 0 disables the worker', () => {
    expect(
      loadConfig({ LTW_ASSET_WORKER_INTERVAL_MS: '0', LTW_ASSET_TIMEOUT_MS: '5000' }).assets,
    ).toEqual({
      workerIntervalMs: 0,
      generationTimeoutMs: 5_000,
      generator: { kind: 'placeholder' },
    });
    expect(() => loadConfig({ LTW_ASSET_WORKER_INTERVAL_MS: '10' })).toThrow(
      /LTW_ASSET_WORKER_INTERVAL_MS/,
    );
    expect(() => loadConfig({ LTW_ASSET_TIMEOUT_MS: '10' })).toThrow(/LTW_ASSET_TIMEOUT_MS/);
  });

  it('runs the OpenRouter image generator only with its key, and an allowed model', () => {
    const key = 'sk-or-v1-TEST-ONLY-config-key';
    const remote = loadConfig({
      LTW_IMAGE_GENERATOR: 'openrouter-openai',
      OPENROUTER_API_KEY: key,
    });
    expect(remote.assets.generationTimeoutMs).toBe(180_000);
    const { generator } = remote.assets;
    if (generator.kind !== 'openrouter-openai') throw new Error('expected the remote generator');
    expect(generator.model).toBe('openai/gpt-5.4-image-2');
    expect(generator.apiKey.reveal()).toBe(key);
    expect(JSON.stringify(remote)).not.toContain(key);
    expect(inspect(remote, { depth: 10 })).not.toContain(key);
    expect(
      loadConfig({
        LTW_IMAGE_GENERATOR: 'openrouter-openai',
        OPENROUTER_API_KEY: key,
        LTW_IMAGE_MODEL: 'openai/gpt-5-image-mini',
        LTW_ASSET_TIMEOUT_MS: '90000',
      }).assets,
    ).toMatchObject({
      generationTimeoutMs: 90_000,
      generator: { model: 'openai/gpt-5-image-mini' },
    });

    // A key alone selects nothing; the placeholder stays the default.
    expect(loadConfig({ OPENROUTER_API_KEY: key }).assets.generator).toEqual({
      kind: 'placeholder',
    });
    expect(() => loadConfig({ LTW_IMAGE_GENERATOR: 'openrouter-openai' })).toThrow(
      /OPENROUTER_API_KEY: required/,
    );
    for (const env of [
      { LTW_IMAGE_GENERATOR: 'dall-e' },
      { LTW_IMAGE_MODEL: 'openai/dall-e-3-SECRETMODEL' },
    ]) {
      try {
        loadConfig({ ...env, OPENROUTER_API_KEY: key });
        throw new Error('accepted');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        expect(String(error)).not.toContain(key);
        expect(String(error)).not.toContain('SECRETMODEL');
      }
    }
  });

  it('reads the rollback step (LTW_ALLOW_NEWER_SCHEMA): true or false only, false by default', () => {
    expect(loadConfig({ LTW_ALLOW_NEWER_SCHEMA: 'true' }).allowNewerSchema).toBe(true);
    expect(loadConfig({ LTW_ALLOW_NEWER_SCHEMA: 'false' }).allowNewerSchema).toBe(false);
    expect(loadConfig({ LTW_ALLOW_NEWER_SCHEMA: '' }).allowNewerSchema).toBe(false);
    expect(() => loadConfig({ LTW_ALLOW_NEWER_SCHEMA: 'yes' })).toThrow(/LTW_ALLOW_NEWER_SCHEMA/);
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
    expect(config.http).toEqual({ host: '0.0.0.0', port: 8080, trustedProxies: [] });
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

  describe('AI provider (ADR 0017 §2)', () => {
    const KEY = 'sk-ant-test-key-never-shown';

    it('enables the Anthropic adapter only when a key is set', () => {
      expect(loadConfig({ ANTHROPIC_API_KEY: '' }).ai.anthropic).toBeNull();
      const anthropic = loadConfig({ ANTHROPIC_API_KEY: KEY }).ai.anthropic;

      expect(anthropic?.apiKey.reveal()).toBe(KEY);
      expect(anthropic).toMatchObject({ model: DEFAULT_AI_MODEL, timeoutMs: 30_000 });
      expect(DEFAULT_AI_MODEL).toBe('claude-opus-5-5');
    });

    it('reads the model and timeout', () => {
      const anthropic = loadConfig({
        ANTHROPIC_API_KEY: KEY,
        LTW_AI_MODEL: 'claude-sonnet-5-5',
        LTW_AI_TIMEOUT_MS: '5000',
      }).ai.anthropic;

      expect(anthropic).toMatchObject({ model: 'claude-sonnet-5-5', timeoutMs: 5_000 });
    });

    it('reads the relevance budget, with or without a key (ADR 0021)', () => {
      expect(loadConfig({ LTW_AI_RELEVANCE_BUDGET_MS: '750' }).ai.relevanceBudgetMs).toBe(750);
      expect(() => loadConfig({ LTW_AI_RELEVANCE_BUDGET_MS: '50' })).toThrow(ConfigError);
    });

    it('reads the whole-request deadline (1,000–300,000 ms) and the selected approval (B2)', () => {
      expect(loadConfig({ LTW_AI_REQUEST_TIMEOUT_MS: '1000' }).ai.requestTimeoutMs).toBe(1_000);
      expect(loadConfig({ LTW_AI_REQUEST_TIMEOUT_MS: '300000' }).ai.requestTimeoutMs).toBe(300_000);
      for (const invalid of ['0', '999', '300001', '1.5', 'never']) {
        expect(() => loadConfig({ LTW_AI_REQUEST_TIMEOUT_MS: invalid })).toThrow(ConfigError);
      }
      expect(loadConfig({ LTW_AI_APPROVAL_ID: 'stage-300-sonnet' }).ai.approvalId).toBe(
        'stage-300-sonnet',
      );
      expect(loadConfig({ LTW_AI_APPROVAL_ID: '' }).ai.approvalId).toBeNull();
      // It names a stored record; it can never carry a ceiling or an amount.
      expect(() => loadConfig({ LTW_AI_APPROVAL_ID: '$30 grant' })).toThrow(ConfigError);
    });

    it('never renders the key in JSON, strings, or inspection', () => {
      const config = loadConfig({ ANTHROPIC_API_KEY: KEY });

      expect(JSON.stringify(config)).not.toContain(KEY);
      expect(inspect(config, { depth: 10 })).not.toContain(KEY);
      expect(String(config.ai.anthropic?.apiKey)).toBe('[redacted]');
    });

    it.each([
      ['LTW_AI_TIMEOUT_MS', '7'],
      ['LTW_AI_MODEL', 'Bad Model!'],
      ['LTW_AI_RELEVANCE_BUDGET_MS', '99999'],
      ['LTW_AI_REQUEST_TIMEOUT_MS', '424242424'],
      ['LTW_AI_APPROVAL_ID', 'drop table;'],
    ])('rejects an invalid %s without echoing it', (name, value) => {
      const error = (() => {
        try {
          loadConfig({ ANTHROPIC_API_KEY: KEY, [name]: value });
        } catch (caught) {
          return caught;
        }
        return null;
      })();

      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).toContain(name);
      expect((error as ConfigError).message).not.toContain(value);
      expect((error as ConfigError).message).not.toContain(KEY);
    });
  });
});
