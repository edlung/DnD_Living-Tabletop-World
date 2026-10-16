import {
  disabledAuthenticator,
  loadDevPersonaAuthenticator,
  type Authenticator,
} from '../http/auth.ts';
import type { AppConfig } from '../platform/config/config.ts';
import type { Logger } from '../platform/logging/logger.ts';
import { isLoopbackHost } from '../platform/net/addresses.ts';
import type { CredentialStore } from './credential-store.ts';
import { RequestLimits, SIGN_IN_LIMITS } from './limits.ts';
import {
  iso,
  sessionAuthenticator,
  systemAuthClock,
  type AuthClock,
} from './session-authenticator.ts';
import type { SignInDependencies } from './sign-in.ts';
import { evidenceHasher } from './tokens.ts';

/**
 * The server's authentication by mode (docs/adr/0036-production-sign-in.md §5):
 * `invitations` (session cookies, sign-in routes, limits), `dev-personas` (bearer personas,
 * refused under `NODE_ENV=production` or off a loopback `HTTP_HOST` here as well as by
 * configuration) or `disabled`.
 */
export interface Authentication {
  readonly authenticator: Authenticator;
  readonly signIn?: SignInDependencies;
}

export async function composeAuthentication(
  config: Pick<AppConfig, 'nodeEnv' | 'auth' | 'http'>,
  credentials: () => CredentialStore,
  clock: AuthClock = systemAuthClock,
): Promise<Authentication> {
  switch (config.auth.mode) {
    case 'invitations': {
      const publicOrigin = config.auth.publicOrigin;
      if (publicOrigin === undefined) throw new Error('invitations mode needs PUBLIC_ORIGIN');
      const store = credentials();
      return {
        authenticator: sessionAuthenticator(store, clock),
        signIn: {
          credentials: store,
          publicOrigin,
          clock,
          limits: new RequestLimits(SIGN_IN_LIMITS, () => clock.now()),
          evidence: evidenceHasher(),
        },
      };
    }
    case 'dev-personas':
      if (
        config.nodeEnv === 'production' ||
        !isLoopbackHost(config.http.host) ||
        config.auth.personasFile === null
      ) {
        throw new Error('development personas are refused outside a loopback development server');
      }
      return { authenticator: await loadDevPersonaAuthenticator(config.auth.personasFile) };
    case 'disabled':
      return { authenticator: disabledAuthenticator };
  }
}

/** How long attempt evidence is kept, and how long a dead session's row outlives its expiry. */
export const ATTEMPTS_KEPT_MS = 7 * 24 * 60 * 60_000;
export const DEAD_SESSIONS_KEPT_MS = 30 * 24 * 60 * 60_000;
const PRUNE_EVERY_MS = 60 * 60_000;

/** Prunes attempt evidence and long-dead sessions now and hourly; returns its stop. */
export function startCredentialPruning(
  store: CredentialStore,
  logger: Logger,
  clock: AuthClock = systemAuthClock,
): () => void {
  const prune = () => {
    const now = clock.now();
    store
      .prune({
        attemptsBefore: iso(now - ATTEMPTS_KEPT_MS),
        sessionsExpiredBefore: iso(now - DEAD_SESSIONS_KEPT_MS),
      })
      .then(
        (pruned) => {
          logger.info(pruned, 'sign-in records pruned');
        },
        (error: unknown) => {
          logger.warn(
            { err: error instanceof Error ? error.name : 'unknown' },
            'sign-in prune failed',
          );
        },
      );
  };
  prune();
  const timer = setInterval(prune, PRUNE_EVERY_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
