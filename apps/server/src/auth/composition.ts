import {
  disabledAuthenticator,
  loadDevPersonaAuthenticator,
  type Authenticator,
} from '../http/auth.ts';
import type { AppConfig } from '../platform/config/config.ts';
import type { Logger } from '../platform/logging/logger.ts';
import { isLoopbackHost } from '../platform/net/addresses.ts';
import type { CredentialStore } from './credential-store.ts';
import { ACCOUNT_LIMITS, AccountLimits } from '../accounts/account-limits.ts';
import { InMemoryAccountStore, type AccountStore } from '../accounts/account-store.ts';
import { displayAuthenticator, personOrDisplay } from '../display/display-authenticator.ts';
import { DISPLAY_LIMITS, DisplayLimits } from '../display/display-limits.ts';
import { InMemoryDisplayStore, type DisplayStore } from '../display/display-store.ts';
import { OpenTableLinks } from '../display/table-links.ts';
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
  /** Accounts (ADR 0041); in memory unless the composition stores them. */
  accounts: () => AccountStore = () => new InMemoryAccountStore(),
  /** The table's displays and join links (ADR 0042); in memory unless stored. */
  displays: () => DisplayStore = () => new InMemoryDisplayStore(),
): Promise<Authentication> {
  switch (config.auth.mode) {
    case 'invitations': {
      const publicOrigin = config.auth.publicOrigin;
      if (publicOrigin === undefined) throw new Error('invitations mode needs PUBLIC_ORIGIN');
      const store = credentials();
      const displayStore = displays();
      return {
        // A person's session first, then a paired display (ADR 0042), which only reads.
        authenticator: personOrDisplay(
          sessionAuthenticator(store, clock),
          displayAuthenticator(displayStore, clock),
        ),
        signIn: {
          credentials: store,
          publicOrigin,
          clock,
          limits: new RequestLimits(SIGN_IN_LIMITS, () => clock.now()),
          evidence: evidenceHasher(),
          accounts: accounts(),
          accountLimits: new AccountLimits(ACCOUNT_LIMITS, () => clock.now()),
          displays: displayStore,
          displayLimits: new DisplayLimits(DISPLAY_LIMITS, () => clock.now()),
          openLinks: new OpenTableLinks(),
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

/**
 * How long attempt evidence is kept, how long a dead session's row outlives its expiry, and how
 * long a display that never paired outlives its code (ADR 0042).
 */
export const ATTEMPTS_KEPT_MS = 7 * 24 * 60 * 60_000;
export const DEAD_SESSIONS_KEPT_MS = 30 * 24 * 60 * 60_000;
export const WAITING_DISPLAYS_KEPT_MS = 24 * 60 * 60_000;
const PRUNE_EVERY_MS = 60 * 60_000;

/** Prunes attempt evidence, long-dead sessions and unpaired displays now and hourly; its stop. */
export function startCredentialPruning(
  store: CredentialStore,
  logger: Logger,
  clock: AuthClock = systemAuthClock,
  displays?: DisplayStore,
): () => void {
  const prune = () => {
    const now = clock.now();
    Promise.all([
      store.prune({
        attemptsBefore: iso(now - ATTEMPTS_KEPT_MS),
        sessionsExpiredBefore: iso(now - DEAD_SESSIONS_KEPT_MS),
      }),
      displays?.pruneWaiting(iso(now - WAITING_DISPLAYS_KEPT_MS)) ?? Promise.resolve(0),
    ]).then(
      ([pruned, waitingDisplays]) => {
        logger.info({ ...pruned, waitingDisplays }, 'sign-in records pruned');
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
