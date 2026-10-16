import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { isLoopbackHost, parseTrustedProxies } from '../net/addresses.ts';
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_GENERATORS,
  IMAGE_MODELS,
  isImageModel,
  type ImageModel,
} from '../../images/models.ts';
import { parseRoutes, routeIssues, type RouteProvider } from './ai-routes.ts';

/**
 * Validated runtime configuration for the server process.
 *
 * Development and test receive safe local defaults (the docker-compose
 * PostgreSQL instance). Production has no defaults for secrets or
 * connection targets: a missing value is a startup error.
 */
export type NodeEnv = 'development' | 'test' | 'production';
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

/**
 * `invitations`: production sign-in, session cookies only (docs/adr/0036-production-sign-in.md);
 * `dev-personas`: bearer persona tokens (development and test on a loopback `HTTP_HOST` without
 * `PUBLIC_ORIGIN`; refused otherwise and in production);
 * `disabled`: nobody signs in (the production default until a mode is chosen).
 */
export type AuthMode = 'invitations' | 'dev-personas' | 'disabled';

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly logLevel: LogLevel;
  readonly http: {
    readonly host: string;
    readonly port: number;
    /**
     * `LTW_TRUST_PROXY`: the reverse proxy's addresses or ranges, whose `X-Forwarded-For` names
     * the client (Fastify `trustProxy`); empty trusts none. Required in invitations mode, where
     * request limits key on the client (docs/adr/0036-production-sign-in.md, amendment 2026-10-16).
     */
    readonly trustedProxies: readonly string[];
  };
  readonly databaseUrl: string;
  /** docs/adr/0009-http-api-and-dev-authentication.md, docs/adr/0036-production-sign-in.md */
  readonly auth: {
    readonly mode: AuthMode;
    /** Persona token file; set only in dev-personas mode. */
    readonly personasFile: string | null;
    /**
     * `PUBLIC_ORIGIN`, the browser's origin: invitation links, the cookie's `Secure` flag and
     * the origin check. Present (and required) in invitations mode only.
     */
    readonly publicOrigin?: string;
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
    /**
     * The whole-request deadline of DM intents, NPC replies and Chronicle prose
     * (docs/adr/0032-live-ai.md, B2): request start, admission, every attempt and the wait for the
     * trace write. `LTW_AI_TIMEOUT_MS` stays the per-attempt transport bound within it.
     */
    readonly requestTimeoutMs: number;
    /**
     * The operator-created approval this process selects (`LTW_AI_APPROVAL_ID`), or null. It only
     * names a stored record: ceilings live in that record and cannot be set or raised here.
     */
    readonly approvalId: string | null;
    /** The DeepSeek adapter (docs/adr/0032-live-ai.md); null unless a key is set. */
    readonly deepseek: {
      readonly apiKey: Secret;
      readonly model: string;
      readonly timeoutMs: number;
    } | null;
    /**
     * Per-capability provider lists, `provider:model` in order, validated as runtime routes
     * (`ai-routes.ts`); null = none. Spending ceilings are never configuration: they are operator
     * records (docs/adr/0032-live-ai.md, 2026-10-11).
     */
    readonly routes: Readonly<Record<string, readonly string[]>> | null;
  };
  /** Quest definitions (docs/adr/0025-ravenford-integration.md §2). */
  readonly questsFile: string;
  /** The asset worker (docs/adr/0022-asset-identity.md §4) and its image generator (ADR 0035). */
  readonly assets: {
    /** Pause between worker runs; 0 disables the worker. */
    readonly workerIntervalMs: number;
    readonly generationTimeoutMs: number;
    /**
     * `LTW_IMAGE_GENERATOR`: the local placeholder (default), or an OpenAI image model through
     * OpenRouter with the key from `OPENROUTER_API_KEY`. Its spending ceiling is an operator
     * record (`pnpm ai:operator image-budget-set`), never configuration.
     */
    readonly generator:
      | { readonly kind: 'placeholder' }
      | { readonly kind: 'openrouter-openai'; readonly apiKey: Secret; readonly model: ImageModel };
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
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
export const DEFAULT_ASSET_WORKER_INTERVAL_MS = 5_000;
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';
export const DEFAULT_ASSET_TIMEOUT_MS = 60_000;
/** An image model through OpenRouter can take minutes; its default bound is longer. */
export const DEFAULT_REMOTE_IMAGE_TIMEOUT_MS = 180_000;
/**
 * The longest `LTW_ASSET_TIMEOUT_MS`. No image job outlives it, so an image reservation much older
 * than this is orphaned (`src/images/ledger-operator.ts`).
 */
export const MAX_ASSET_TIMEOUT_MS = 600_000;

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
  AUTH_MODE: z.preprocess(
    emptyAsUndefined,
    z.enum(['invitations', 'dev-personas', 'disabled']).optional(),
  ),
  PUBLIC_ORIGIN: z.preprocess(emptyAsUndefined, z.string().max(200).optional()),
  LTW_TRUST_PROXY: z.preprocess(emptyAsUndefined, z.string().max(1_000).optional()),
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
  LTW_AI_REQUEST_TIMEOUT_MS: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().min(1_000).max(300_000).default(DEFAULT_REQUEST_TIMEOUT_MS),
  ),
  LTW_AI_APPROVAL_ID: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)
      .optional(),
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
    z.coerce.number().int().min(1_000).max(MAX_ASSET_TIMEOUT_MS).optional(),
  ),
  LTW_IMAGE_GENERATOR: z.preprocess(
    emptyAsUndefined,
    z.enum(IMAGE_GENERATORS).default('placeholder'),
  ),
  LTW_IMAGE_MODEL: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .refine(isImageModel, `must be one of ${Object.keys(IMAGE_MODELS).join(', ')}`)
      .default(DEFAULT_IMAGE_MODEL),
  ),
  OPENROUTER_API_KEY: z.preprocess(emptyAsUndefined, z.string().trim().min(1).optional()),
});

/**
 * Variables that no longer configure anything. The daily dollar ceiling was removed: a value set
 * here would otherwise look like a cap. Startup warns about them by name, never by value.
 */
export const OBSOLETE_VARIABLES = ['LTW_AI_DAILY_BUDGET_USD'] as const;

export const obsoleteVariables = (env: Env = process.env): string[] =>
  OBSOLETE_VARIABLES.filter((name) => env[name] !== undefined && env[name] !== '');

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
  if (authMode === 'dev-personas') {
    const issue = personasIssue(values);
    if (issue !== null) issues.push(`AUTH_MODE: ${issue}`);
  }
  const publicOrigin = values.PUBLIC_ORIGIN;
  if (publicOrigin !== undefined) {
    const issue = originIssue(publicOrigin, values.NODE_ENV);
    if (issue !== null) issues.push(`PUBLIC_ORIGIN: ${issue}`);
  } else if (authMode === 'invitations') {
    issues.push('PUBLIC_ORIGIN: required in invitations mode');
  }

  let trustedProxies: readonly string[] = [];
  if (values.LTW_TRUST_PROXY !== undefined) {
    const parsed = parseTrustedProxies(values.LTW_TRUST_PROXY);
    if (parsed === null) {
      issues.push(
        'LTW_TRUST_PROXY: must be none, or proxy addresses or CIDR ranges separated by commas (no /0)',
      );
    } else {
      trustedProxies = parsed;
    }
  } else if (authMode === 'invitations') {
    // Limits key on the client: an unset value must not silently count the proxy for everyone.
    issues.push('LTW_TRUST_PROXY: required in invitations mode (none, or the reverse proxy)');
  }

  const routes = parseRoutes(values.LTW_AI_ROUTES, issues);
  if (routes !== null) {
    const keyed = new Set<RouteProvider>([
      ...(values.ANTHROPIC_API_KEY === undefined ? [] : (['anthropic'] as const)),
      ...(values.DEEPSEEK_API_KEY === undefined ? [] : (['deepseek'] as const)),
    ]);
    issues.push(...routeIssues(routes, 'runtime', keyed));
  }
  const openRouterKey = values.OPENROUTER_API_KEY;
  if (values.LTW_IMAGE_GENERATOR === 'openrouter-openai' && openRouterKey === undefined) {
    issues.push('OPENROUTER_API_KEY: required for LTW_IMAGE_GENERATOR=openrouter-openai');
  }
  if (issues.length > 0 || databaseUrl === undefined) {
    throw new ConfigError(issues);
  }

  return Object.freeze({
    nodeEnv: values.NODE_ENV,
    logLevel: values.LOG_LEVEL ?? DEFAULT_LOG_LEVEL[values.NODE_ENV],
    http: Object.freeze({
      host: values.HTTP_HOST,
      port: values.HTTP_PORT,
      trustedProxies: Object.freeze([...trustedProxies]),
    }),
    databaseUrl,
    auth: Object.freeze({
      mode: authMode,
      personasFile:
        authMode === 'dev-personas' ? (values.DEV_PERSONAS_FILE ?? DEFAULT_PERSONAS_FILE) : null,
      ...(authMode === 'invitations' && publicOrigin !== undefined ? { publicOrigin } : {}),
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
      requestTimeoutMs: values.LTW_AI_REQUEST_TIMEOUT_MS,
      approvalId: values.LTW_AI_APPROVAL_ID ?? null,
      deepseek:
        values.DEEPSEEK_API_KEY === undefined
          ? null
          : Object.freeze({
              apiKey: new Secret(values.DEEPSEEK_API_KEY),
              model: values.LTW_DEEPSEEK_MODEL,
              timeoutMs: values.LTW_AI_TIMEOUT_MS,
            }),
      routes: routes === null ? null : Object.freeze(routes),
    }),
    questsFile: values.LTW_QUESTS_FILE ?? DEFAULT_QUESTS_FILE,
    assets: Object.freeze({
      workerIntervalMs: values.LTW_ASSET_WORKER_INTERVAL_MS,
      generationTimeoutMs:
        values.LTW_ASSET_TIMEOUT_MS ??
        (values.LTW_IMAGE_GENERATOR === 'openrouter-openai'
          ? DEFAULT_REMOTE_IMAGE_TIMEOUT_MS
          : DEFAULT_ASSET_TIMEOUT_MS),
      generator: Object.freeze(
        values.LTW_IMAGE_GENERATOR === 'openrouter-openai' && openRouterKey !== undefined
          ? {
              kind: 'openrouter-openai' as const,
              apiKey: new Secret(openRouterKey),
              model: values.LTW_IMAGE_MODEL,
            }
          : { kind: 'placeholder' as const },
      ),
    }),
  });
}

/**
 * Why development personas cannot run with these settings, or null. Personas sign anyone in as
 * anyone, so they run only on a development server that listens on loopback and has no public
 * origin: a forgotten `NODE_ENV` on a public host fails closed (ADR 0036, amendment 2026-10-16).
 */
function personasIssue(values: {
  readonly NODE_ENV: NodeEnv;
  readonly PUBLIC_ORIGIN?: string | undefined;
  readonly HTTP_HOST: string;
}): string | null {
  if (values.NODE_ENV === 'production') return 'dev-personas is not allowed in production';
  if (values.PUBLIC_ORIGIN !== undefined) {
    return 'dev-personas is refused with PUBLIC_ORIGIN (choose invitations or disabled)';
  }
  if (!isLoopbackHost(values.HTTP_HOST)) {
    return 'dev-personas is refused unless HTTP_HOST is loopback only (choose invitations or disabled)';
  }
  return null;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Why a public origin is unusable, or null: exactly `scheme://host[:port]`, HTTPS, or plain
 * HTTP for a loopback host outside production (the only case the cookie drops `Secure`).
 */
function originIssue(value: string, nodeEnv: NodeEnv): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'must be an origin: https://<host>[:<port>]';
  }
  if (url.origin !== value) return 'must be an origin: https://<host>[:<port>]';
  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && LOOPBACK.has(url.hostname) && nodeEnv !== 'production') {
    return null;
  }
  return 'must use https (plain http only for localhost outside production)';
}

/** Renders a connection string safe for logs: credentials are removed. */
export function describeDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
}
