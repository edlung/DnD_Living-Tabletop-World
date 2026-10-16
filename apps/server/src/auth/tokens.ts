import { createHash, createHmac, randomBytes } from 'node:crypto';

import { CREDENTIAL_TOKEN_PATTERN, SESSION_COOKIE } from '@ltw/contracts';

import { TOKEN_PREFIX_LENGTH } from './limits.ts';

/**
 * Credentials of production sign-in (docs/adr/0036-production-sign-in.md §1, §3): 256-bit random
 * tokens, stored only as SHA-256 hashes. A token exists in this process only between the request
 * that carries it and its hash; it is never logged, traced, stored or put in an error.
 */
export const newToken = (): string => randomBytes(32).toString('base64url');

export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const isToken = (value: string): boolean => CREDENTIAL_TOKEN_PATTERN.test(value);

/** What keys a token's failed redeems (the prefix never leaves the process). */
export const tokenPrefix = (token: string): string => token.slice(0, TOKEN_PREFIX_LENGTH);

/**
 * Keys of the attempts table (`ltw_auth_attempts`): an HMAC under a key that lives in this
 * process only, so a database reader can count distinct sources but never recover an address
 * or a token prefix.
 */
export function evidenceHasher(key: Buffer = randomBytes(32)): (value: string) => string {
  return (value) => createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

/** The values of every session cookie a `Cookie` header carries, in order. */
function sessionCookieValues(cookie: string | undefined): string[] {
  if (cookie === undefined) return [];
  return cookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`))
    .map((part) => part.slice(SESSION_COOKIE.length + 1));
}

/** The session token of a `Cookie` header, or null (absent, repeated or malformed). */
export function sessionTokenFrom(cookie: string | undefined): string | null {
  const values = sessionCookieValues(cookie);
  // Two session cookies (a path or domain variant) are ambiguous: neither is trusted.
  const [only] = values;
  return values.length === 1 && only !== undefined && isToken(only) ? only : null;
}

/**
 * How many session cookies a request presented, well formed or not. Only a request that
 * presented exactly one may have it cleared: a cross-site navigation never carries the strict
 * cookie, and clearing on its behalf would sign the browser out (ADR 0036, amendment 2026-10-16).
 */
export const presentedSessionCookies = (cookie: string | undefined): number =>
  sessionCookieValues(cookie).length;

/** Whether the cookie needs `Secure`: always, except for an `http://` loopback development origin. */
export function secureCookies(publicOrigin: string): boolean {
  const url = new URL(publicOrigin);
  return !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
}

export const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

const ATTRIBUTES = 'Path=/api; HttpOnly; SameSite=Strict';

/** `Set-Cookie` for a new session (ADR 0036 §3): script cannot read it; other sites never send it. */
export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; ${ATTRIBUTES}; Max-Age=${String(maxAgeSeconds)}${secure ? '; Secure' : ''}`;
}

/** `Set-Cookie` that removes the session cookie from the browser. */
export function clearedSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; ${ATTRIBUTES}; Max-Age=0${secure ? '; Secure' : ''}`;
}
