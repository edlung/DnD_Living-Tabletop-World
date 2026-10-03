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

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly logLevel: LogLevel;
  readonly http: {
    readonly host: string;
    readonly port: number;
  };
  readonly databaseUrl: string;
}

export type Env = Readonly<Record<string, string | undefined>>;

/** Local development database exposed by docker-compose.yml. Never valid in production. */
export const DEV_DATABASE_URL = 'postgres://ltw:ltw_dev_password@127.0.0.1:54329/ltw';

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

  if (issues.length > 0 || databaseUrl === undefined) {
    throw new ConfigError(issues);
  }

  return Object.freeze({
    nodeEnv: values.NODE_ENV,
    logLevel: values.LOG_LEVEL ?? DEFAULT_LOG_LEVEL[values.NODE_ENV],
    http: Object.freeze({ host: values.HTTP_HOST, port: values.HTTP_PORT }),
    databaseUrl,
  });
}

/** Renders a connection string safe for logs: credentials are removed. */
export function describeDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
}
