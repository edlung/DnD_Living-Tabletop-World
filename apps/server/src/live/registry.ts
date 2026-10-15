/**
 * Who holds live subscriptions (docs/adr/0033-live-session.md §1, §5): the caps (per actor per
 * campaign and per process) and presence. Presence is ephemeral and per process: an actor is
 * connected to a campaign while one of its subscriptions there is open, and for a grace period
 * after the last one closes, so a reconnect does not flicker. Several tabs count once.
 */
export interface PresenceSource {
  connected(campaignId: string, actorId: string): boolean;
}

/** Without a live session nobody is connected. */
export const NOBODY_CONNECTED: PresenceSource = { connected: () => false };

export interface LiveTicket {
  readonly campaignId: string;
  readonly actorId: string;
}

export interface RegistryOptions {
  readonly now: () => number;
  readonly graceMs: number;
  readonly perActor: number;
  readonly perProcess: number;
}

// Campaign and actor IDs never contain a newline (their patterns forbid it).
const keyOf = (campaignId: string, actorId: string) => `${campaignId}\n${actorId}`;

export class LiveRegistry implements PresenceSource {
  readonly #options: RegistryOptions;
  readonly #open = new Map<string, number>();
  readonly #closedAt = new Map<string, number>();
  readonly #released = new WeakSet<LiveTicket>();
  #total = 0;

  constructor(options: RegistryOptions) {
    this.#options = options;
  }

  /** A ticket for one more subscription, or null when a cap is reached (`overloaded`). */
  admit(campaignId: string, actorId: string): LiveTicket | null {
    const key = keyOf(campaignId, actorId);
    const open = this.#open.get(key) ?? 0;
    if (open >= this.#options.perActor || this.#total >= this.#options.perProcess) return null;
    this.#open.set(key, open + 1);
    this.#closedAt.delete(key);
    this.#total += 1;
    return { campaignId, actorId };
  }

  /** Idempotent. The last subscription of an actor starts its grace period. */
  release(ticket: LiveTicket): void {
    if (this.#released.has(ticket)) return;
    this.#released.add(ticket);
    const key = keyOf(ticket.campaignId, ticket.actorId);
    const open = (this.#open.get(key) ?? 1) - 1;
    const now = this.#options.now();
    if (open > 0) {
      this.#open.set(key, open);
    } else {
      this.#open.delete(key);
      this.#closedAt.set(key, now);
    }
    this.#total -= 1;
    // Forget graces that ran out, so the map holds recent departures only.
    for (const [departed, at] of this.#closedAt) {
      if (now - at >= this.#options.graceMs) this.#closedAt.delete(departed);
    }
  }

  connected(campaignId: string, actorId: string): boolean {
    const key = keyOf(campaignId, actorId);
    if ((this.#open.get(key) ?? 0) > 0) return true;
    const closedAt = this.#closedAt.get(key);
    if (closedAt === undefined) return false;
    if (this.#options.now() - closedAt < this.#options.graceMs) return true;
    this.#closedAt.delete(key);
    return false;
  }

  /** Open subscriptions in this process. */
  get size(): number {
    return this.#total;
  }
}
