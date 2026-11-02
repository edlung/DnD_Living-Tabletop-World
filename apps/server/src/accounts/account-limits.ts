import { WindowCounter } from '../auth/window-counter.ts';

/**
 * Limits of accounts (docs/adr/0041-accounts.md §6): per process, bounded like the sign-in limits
 * (`auth/limits.ts`). A table that cannot follow a new key refuses it (fail closed).
 */
const MINUTE = 60_000;
const QUARTER = 15 * MINUTE;
const HOUR = 60 * MINUTE;

export interface AccountLimitSettings {
  /** Sign-in attempts per client group a minute. */
  readonly signInPerMinute: number;
  /** Failed sign-ins of one login before it refuses for a quarter of an hour. */
  readonly loginFailures: number;
  /**
   * New accounts per client group an hour (redeems and claims). Each needs a live invitation, and a
   * family table's devices share one address: room for a whole table joining at once.
   */
  readonly accountsPerHour: number;
  /** Campaigns an account creates from templates an hour. */
  readonly campaignsPerHour: number;
  readonly trackedKeys: number;
}

export const ACCOUNT_LIMITS: AccountLimitSettings = {
  signInPerMinute: 10,
  loginFailures: 5,
  accountsPerHour: 20,
  campaignsPerHour: 5,
  trackedKeys: 10_000,
};

export class AccountLimits {
  readonly #now: () => number;
  readonly #signIns: WindowCounter;
  readonly #failures: WindowCounter;
  readonly #accounts: WindowCounter;
  readonly #campaigns: WindowCounter;
  readonly #loginFailures: number;

  constructor(settings: AccountLimitSettings, now: () => number) {
    this.#now = now;
    const maxKeys = settings.trackedKeys;
    this.#signIns = new WindowCounter({
      limit: settings.signInPerMinute,
      windowMs: MINUTE,
      maxKeys,
    });
    this.#failures = new WindowCounter({
      limit: settings.loginFailures,
      windowMs: QUARTER,
      maxKeys,
    });
    this.#accounts = new WindowCounter({
      limit: settings.accountsPerHour,
      windowMs: HOUR,
      maxKeys,
    });
    this.#campaigns = new WindowCounter({
      limit: settings.campaignsPerHour,
      windowMs: HOUR,
      maxKeys,
    });
    this.#loginFailures = settings.loginFailures;
  }

  /** Admits one sign-in from a client for a login: false when too fast or the login is resting. */
  signIn(client: string, login: string): boolean {
    const now = this.#now();
    if (this.#failures.count(login, now) >= this.#loginFailures) return false;
    if (!this.#failures.accepts(login, now)) return false;
    return this.#signIns.take(client, now) === 'taken';
  }

  /** A failed sign-in of a login. */
  failed(login: string): void {
    this.#failures.add(login, this.#now());
  }

  /** Admits one new account from a client. */
  account(client: string): boolean {
    return this.#accounts.take(client, this.#now()) === 'taken';
  }

  /** Admits one new campaign of an account. */
  campaign(accountId: string): boolean {
    return this.#campaigns.take(accountId, this.#now()) === 'taken';
  }
}
