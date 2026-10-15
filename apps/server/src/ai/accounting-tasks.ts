import { settleWithRetry } from './accounting/settlement.ts';
import type { BudgetStore, SettlementInput, SuspectReason } from './accounting/types.ts';

/**
 * Accounting work that outlives the caller (docs/STAGE_300_REMEDIATION_DESIGN.md §1–2; ADR 0032,
 * B2): settlement of known usage, the automatic stop of a suspect response and the provider's
 * request ID, each retried after 100, 500 and 2,000 ms (then left for the operator); and proven
 * pre-dispatch releases. None of it delays a caller; each transaction has its own fixed 5,000 ms
 * bound. A failure is reported by a fixed code only (never an amount, campaign or provider detail)
 * and leaves the hold in place.
 *
 * Until a suspect response's stop has committed, this process refuses the stopped route itself
 * (B2 repair 1): the provider and model for an unexpected model, the whole provider for unverified
 * billing, as the stop row will. A stop whose every retry failed keeps its route refused for the
 * life of the process; only the committed stop (and its operator clearance) governs other processes.
 */
export type AccountingIssue =
  | 'SETTLEMENT_HELD'
  | 'SETTLEMENT_FAILED'
  | 'RELEASE_FAILED'
  | 'STOP_FAILED'
  | 'RESPONSE_NOT_RECORDED'
  | 'OUTCOME_CONFLICT'
  | 'OUTCOME_NOT_RECORDED';

/** A suspect attempt's stop and the route it covers (canonical model). */
export interface SuspectStop {
  readonly attemptId: string;
  readonly reason: SuspectReason;
  readonly returnedModel: string | null;
  readonly provider: string;
  readonly model: string;
}

const routeKey = (provider: string, model: string | null) => JSON.stringify([provider, model]);

export class AccountingTasks {
  readonly #pending = new Set<Promise<void>>();
  readonly #refused = new Map<string, number>();
  readonly #shutdown = new AbortController();
  readonly #report: (issue: AccountingIssue) => void;
  readonly #sleep: ((ms: number) => Promise<void>) | undefined;

  constructor(
    report: (issue: AccountingIssue) => void = () => undefined,
    options: { readonly sleep?: (ms: number) => Promise<void> } = {},
  ) {
    this.#report = report;
    this.#sleep = options.sleep;
  }

  /** Runs `work` in the background; its failure is reported as `issue`. */
  run(issue: AccountingIssue, work: () => Promise<unknown>): void {
    const task = Promise.resolve()
      .then(work)
      .then(
        () => undefined,
        () => {
          this.#report(issue);
        },
      )
      .finally(() => {
        this.#pending.delete(task);
      });
    this.#pending.add(task);
  }

  /** Retries an idempotent write; resolves whether it committed. A rejection is final. */
  async #retried(write: () => Promise<unknown>): Promise<boolean> {
    const outcome = await settleWithRetry(write, {
      shutdown: this.#shutdown.signal,
      ...(this.#sleep ? { sleep: this.#sleep } : {}),
    });
    return outcome !== 'held';
  }

  /** Settles known usage, retrying; exhausted retries keep the full hold. */
  settle(store: BudgetStore, input: SettlementInput): void {
    this.run('SETTLEMENT_FAILED', async () => {
      if (!(await this.#retried(() => store.settle(input)))) this.#report('SETTLEMENT_HELD');
    });
  }

  /**
   * Keeps a suspect attempt's hold and appends its stop (idempotent), retrying; refuses the route
   * in this process from now until the stop has committed.
   */
  holdWithStop(store: BudgetStore, stop: SuspectStop): void {
    const key = routeKey(stop.provider, stop.reason === 'UNEXPECTED_MODEL' ? stop.model : null);
    this.#refused.set(key, (this.#refused.get(key) ?? 0) + 1);
    const lift = () => {
      const left = (this.#refused.get(key) ?? 1) - 1;
      if (left > 0) this.#refused.set(key, left);
      else this.#refused.delete(key);
    };
    this.run('STOP_FAILED', async () => {
      const committed = await this.#retried(() =>
        store.holdWithStop(stop.attemptId, stop.reason, stop.returnedModel),
      );
      if (!committed) throw new Error('stop not committed');
      lift();
    });
  }

  /** Whether an uncommitted automatic stop of this process covers the route. */
  refuses(provider: string, model: string): boolean {
    return (
      this.#refused.has(routeKey(provider, model)) || this.#refused.has(routeKey(provider, null))
    );
  }

  /** Records the provider's request/message ID of an attempt, retrying. */
  recordResponse(
    store: BudgetStore,
    attemptId: string,
    providerRequestId: string,
    returnedModel: string | null,
  ): void {
    this.run('RESPONSE_NOT_RECORDED', async () => {
      const recorded = await this.#retried(() =>
        store.recordResponse(attemptId, providerRequestId, returnedModel),
      );
      if (!recorded) throw new Error('response not recorded');
    });
  }

  report(issue: AccountingIssue): void {
    this.#report(issue);
  }

  /** Resolves once every task started so far (and any they start) has finished. */
  async idle(): Promise<void> {
    while (this.#pending.size > 0) await Promise.all([...this.#pending]);
  }

  /** Stops retrying (holds and refusals stay) and waits for running transactions. */
  async shutdown(): Promise<void> {
    this.#shutdown.abort();
    await this.idle();
  }
}
