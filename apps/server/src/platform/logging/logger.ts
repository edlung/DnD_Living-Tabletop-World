import { pino, stdSerializers, type DestinationStream, type Logger as PinoLogger } from 'pino';

import type { LogLevel } from '../config/config.ts';

/**
 * Structured JSON logger shared by every server module.
 *
 * Modules receive a child logger with their own bindings (`module`, and later
 * request ID, actor/perspective, knowledge scope — ARCHITECTURE.md
 * Observability) instead of creating loggers themselves.
 */
export type Logger = PinoLogger;

export interface LoggerOptions {
  readonly service: string;
  readonly level: LogLevel;
  /** Defaults to stdout. Tests inject an in-memory stream. */
  readonly destination?: DestinationStream;
}

export const REDACTED = '[REDACTED]';

/**
 * Field names that must never reach log output, at the top level or one
 * object deep. Redaction is a safety net; callers still must not log secrets.
 */
const SENSITIVE_KEYS = [
  'password',
  'secret',
  'token',
  'apiKey',
  'authorization',
  'cookie',
  'databaseUrl',
  'connectionString',
] as const;

/** Client addresses: never logged (ADR 0036, amendment 2026-10-16); redacted as a safety net. */
const ADDRESS_KEYS = ['remoteAddress', 'remotePort', 'ip', 'ips'] as const;

const REDACT_PATHS = [
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((key) => `*.${key}`),
  ...ADDRESS_KEYS,
  ...ADDRESS_KEYS.map((key) => `*.${key}`),
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-forwarded-for"]',
];

/**
 * How a request, a response and an error appear in a log line. Fastify's own request lines use
 * these instead of its defaults, which carry the client's address and port: a request is its
 * method and URL, a response its status; never an address, a header, a cookie or a body.
 */
export const LOG_SERIALIZERS: {
  readonly req: (request: { readonly method?: unknown; readonly url?: unknown }) => object;
  readonly res: (reply: { readonly statusCode?: unknown }) => object;
  readonly err: (error: Error) => object;
} = {
  req: (request) => ({ method: request.method, url: request.url }),
  res: (reply) => ({ statusCode: reply.statusCode }),
  err: (error) => stdSerializers.err(error),
};

export function createLogger(options: LoggerOptions): Logger {
  return pino(
    {
      level: options.level,
      base: { service: options.service },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
      redact: { paths: REDACT_PATHS, censor: REDACTED },
      serializers: LOG_SERIALIZERS,
    },
    options.destination,
  );
}
