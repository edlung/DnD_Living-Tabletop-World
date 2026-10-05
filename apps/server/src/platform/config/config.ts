import { fileURLToPath } from 'node:url';

import { z } from 'zod';

/**
 * Validated runtime configuration for the server process.
 *
 * Development and test receive safe local defaults (the docker-compose
 * PostgreSQL instance). Production has no defaults for secrets or
 * connection targets: a missing value is a startup error.
 */
export type NodeEnv = 'development' | 'test' | 'production';
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export type AuthMode = 'dev-personas' | 'disabled';

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly logLevel: LogLevel;
  readonly http: {
    readonly host: string;
    readonly port: number;
  };
  readonly databaseUrl: string;
  /** docs/adr/0009-http-api-and-dev-authentication.md */
  readonly auth: {
    readonly mode: AuthMode;
    /** Persona token file; set only in dev-personas mode. */
    readonly personasFile: string | null;
  };
  /** docs/adr/0017-ai-gateway.md §2 */
  readonly ai: {
    /** The Anthropic adapter; null (local provider only) unless a key is set. */
    readonly anthropic: {
      readonly apiKey: Secret;
      readonly model: string;
      readonly timeoutMs: number;
    } | null;
    /** How long a context request waits for the relevance ranker (docs/adr/0021-ai-relevance.md). */
    readonly relevanceBudgetMs: number;
    /** The DeepSeek adapter (docs/adr/0032-live-ai.md); null unless a key is set. */
    readonly deepseek: {
      readonly apiKey: Secret;
      readonly model: string;
      readonly timeoutMs: number;
    } | null;
    /** Per-capability provider lists, `provider:model` in order; null = the default routing. */
    readonly routes: Readonly<Record<string, readonly string[]>> | null;
    /** The daily spending ceiling in US dollars for every live provider together. */
    readonly dailyBudgetUsd: number;
  };
  /** Quest definitions (docs/adr/0025-ravenford-integration.md §2). */
  readonly questsFile: string;
  /** The asset worker (docs/adr/0022-asset-identity.md §4); the local placeholder generator only. */
  readonly assets: {
    /** Pause between worker runs; 0 disables the worker. */
    readonly workerIntervalMs: number;
    readonly generationTimeoutMs: number;
  };
}

/** A value that renders as `[redacted]` in logs, JSON, and inspection; read it with `reveal()`. */
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toJSON(): string {
    return '[redacted]';
  }

  toString(): string {
    return '[redacted]';
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return '[redacted]';
  }
}

export const DEFAULT_AI_MODEL = 'claude-opus-5-5';
export const DEFAULT_AI_TIMEOUT_MS = 30_000;
export const DEFAULT_RELEVANCE_BUDGET_MS = 2_000;
export const DEFAULT_ASSET_WORKER_INTERVAL_MS = 5_000;
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';
export const DEFAULT_DAILY_BUDGET_USD = 5;
export const DEFAULT_ASSET_TIMEOUT_MS = 60_000;

export type Env = Readonly<Record<string, string | undefined>>;

/** Local development database exposed by docker-compose.yml. Never valid in production. */
export const DEV_DATABASE_URL = 'postgres://ltw:ltw_dev_password@127.0.0.1:54329/ltw';

/** Development persona tokens; resolved from both `src/` and `dist/`. */
export const DEFAULT_PERSONAS_FILE = fileURLToPath(
  new URL('../../../../../fixtures/ravenford/personas.json', import.meta.url),
);

/** Ravenford's quest definitions (ADR 0025 §2); resolved from both `src/` and `dist/`. */
export const DEFAULT_QUESTS_FILE = fileURLToPath(
  new URL('../../../../../fixtures/ravenford/quests.json', import.meta.url),
);

const DEFAULT_LOG_LEVEL: Record<NodeEnv, LogLevel> = {
  development: 'debug',
  test: 'silent',
  production: 'info',
};

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const emptyAsUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

const envSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyAsUndefined,
    z.enum(['development', 'test', 'production']).default('development'),
  ),
  LOG_LEVEL: z.preprocess(emptyAsUndefined, z.enum(LOG_LEVELS).optional()),
  HTTP_HOST: z.preprocess(emptyAsUndefined, z.string().min(1).default('127.0.0.1')),
  HTTP_PORT: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().min(0).max(65535).default(3000),
  ),
  DATABASE_URL: z.preprocess(emptyAsUndefined, z.url({ protocol: /^postgres(ql)?$/ }).optional()),
  AUTH_MODE: z.preprocess(emptyAsUndefined, z.enum(['dev-personas', 'disabled']).optional()),
  DEV_PERSONAS_FILE: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
  LTW_QUESTS_FILE: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
  ANTHROPIC_API_KEY: z.preprocess(emptyAsUndefined, z.string().trim().min(1).optional()),
  LTW_AI_MODEL: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{0,99}$/)
      .default(DEFAULT_AI_MODEL),
  ),
  LTW_AI_TIMEOUT_MS: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().min(1_000).max(300_000).default(DEFAULT_AI_TIMEOUT_MS),
  ),
  DEEPSEEK_API_KEY: z.preprocess(emptyAsUndefined, z.string().trim().min(1).optional()),
  LTW_DEEPSEEK_MODEL: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{0,99}$/)
      .default(DEFAULT_DEEPSEEK_MODEL),
  ),
  LTW_AI_ROUTES: z.preprocess(emptyAsUndefined, z.string().max(2_000).optional()),
  LTW_AI_DAILY_BUDGET_USD: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().min(0).max(10_000).default(DEFAULT_DAILY_BUDGET_USD),
  ),
  LTW_AI_RELEVANCE_BUDGET_MS: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().min(100).max(30_000).default(DEFAULT_RELEVANCE_BUDGET_MS),
  ),
  LTW_ASSET_WORKER_INTERVAL_MS: z.preprocess(
    emptyAsUndefined,
    z.coerce
      .number()
      .int()
      .refine((ms) => ms === 0 || (ms >= 500 && ms <= 600_000), 'must be 0 or 500-600000')
      .default(DEFAULT_ASSET_WORKER_INTERVAL_MS),
  ),
  LTW_ASSET_TIMEOUT_MS: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().min(1_000).max(600_000).default(DEFAULT_ASSET_TIMEOUT_MS),
  ),
});

export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid server configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/**
 * Parses and validates configuration from an environment map.
 * Error messages name the offending variable but never echo its value,
 * so secrets cannot leak through startup logs.
 */
export function loadConfig(env: Env = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }

  const values = parsed.data;
  const issues: string[] = [];

  let databaseUrl = values.DATABASE_URL;
  if (databaseUrl === undefined) {
    if (values.NODE_ENV === 'production') {
      issues.push('DATABASE_URL: required in production');
    } else {
      databaseUrl = DEV_DATABASE_URL;
    }
  } else if (values.NODE_ENV === 'production' && databaseUrl === DEV_DATABASE_URL) {
    issues.push('DATABASE_URL: development default credentials are not allowed in production');
  }

  const authMode: AuthMode =
    values.AUTH_MODE ?? (values.NODE_ENV === 'production' ? 'disabled' : 'dev-personas');
  if (values.NODE_ENV === 'production' && authMode === 'dev-personas') {
    issues.push('AUTH_MODE: dev-personas is not allowed in production');
  }

  const routes = parseRoutes(values.LTW_AI_ROUTES, issues);
  if (issues.length > 0 || databaseUrl === undefined) {
    throw new ConfigError(issues);
  }

  return Object.freeze({
    nodeEnv: values.NODE_ENV,
    logLevel: values.LOG_LEVEL ?? DEFAULT_LOG_LEVEL[values.NODE_ENV],
    http: Object.freeze({ host: values.HTTP_HOST, port: values.HTTP_PORT }),
    databaseUrl,
    auth: Object.freeze({
      mode: authMode,
      personasFile:
        authMode === 'dev-personas' ? (values.DEV_PERSONAS_FILE ?? DEFAULT_PERSONAS_FILE) : null,
    }),
    ai: Object.freeze({
      anthropic:
        values.ANTHROPIC_API_KEY === undefined
          ? null
          : Object.freeze({
              apiKey: new Secret(values.ANTHROPIC_API_KEY),
              model: values.LTW_AI_MODEL,
              timeoutMs: values.LTW_AI_TIMEOUT_MS,
            }),
      relevanceBudgetMs: values.LTW_AI_RELEVANCE_BUDGET_MS,
      deepseek:
        values.DEEPSEEK_API_KEY === undefined
          ? null
          : Object.freeze({
              apiKey: new Secret(values.DEEPSEEK_API_KEY),
              model: values.LTW_DEEPSEEK_MODEL,
              timeoutMs: values.LTW_AI_TIMEOUT_MS,
            }),
      routes: routes === null ? null : Object.freeze(routes),
      dailyBudgetUsd: values.LTW_AI_DAILY_BUDGET_USD,
    }),
    questsFile: values.LTW_QUESTS_FILE ?? DEFAULT_QUESTS_FILE,
    assets: Object.freeze({
      workerIntervalMs: values.LTW_ASSET_WORKER_INTERVAL_MS,
      generationTimeoutMs: values.LTW_ASSET_TIMEOUT_MS,
    }),
  });
}

const ROUTE_CAPABILITIES = ['reasoning', 'npc-dialogue', 'narrative', 'fast-context'] as const;

/**
 * `LTW_AI_ROUTES`: `capability=provider:model,provider:model;capability=…`. Providers are
 * `anthropic` and `deepseek`; `local` may end a list. Names the problem, never a value.
 */
function parseRoutes(
  text: string | undefined,
  issues: string[],
): Record<string, readonly string[]> | null {
  if (text === undefined) return null;
  const routes: Record<string, readonly string[]> = {};
  for (const part of text.split(';').filter((entry) => entry.trim() !== '')) {
    const [capability, list] = part.split('=').map((piece) => piece.trim());
    const entries = (list ?? '').split(',').map((entry) => entry.trim());
    const valid =
      capability !== undefined &&
      (ROUTE_CAPABILITIES as readonly string[]).includes(capability) &&
      entries.length > 0 &&
      entries.every(
        (entry) => entry === 'local' || /^(anthropic|deepseek):[a-z0-9][a-z0-9.-]*$/.test(entry),
      );
    if (!valid) {
      issues.push('LTW_AI_ROUTES: expected capability=provider:model[,provider:model];…');
      return null;
    }
    routes[capability] = entries;
  }
  return routes;
}

/** Renders a connection string safe for logs: credentials are removed. */
export function describeDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
}
