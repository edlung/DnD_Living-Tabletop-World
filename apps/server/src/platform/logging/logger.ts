import { pino, type DestinationStream, type Logger as PinoLogger } from 'pino';

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

const REDACT_PATHS = [
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((key) => `*.${key}`),
  'req.headers.authorization',
  'req.headers.cookie',
];

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
    },
    options.destination,
  );
}
