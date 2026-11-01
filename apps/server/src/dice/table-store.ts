import type { Check, RollGroup, RollMode, RollSubject } from '@ltw/contracts';

/**
 * The table's rolls and the DM's check requests (Stage 510, migration 0025): rolled by the server,
 * kept beside the world, never canonical history — a free roll or a check changes nothing in the
 * world until the DM decides it does.
 */
export interface TableRollRecord {
  readonly rollId: string;
  readonly campaignId: string;
  /** The rolling character; null is the DM. */
  readonly rollerId: string | null;
  readonly subject: RollSubject;
  readonly groups: readonly RollGroup[];
  /** A DM roll the players do not see. */
  readonly hidden: boolean;
  readonly requestId: string | null;
  readonly at: string;
}

export interface CheckRequestRecord {
  readonly requestId: string;
  readonly campaignId: string;
  readonly characterId: string;
  readonly check: Check;
  readonly mode: RollMode;
  readonly dc: number | null;
  readonly status: 'open' | 'rolled' | 'cancelled';
  readonly rollId: string | null;
  readonly total: number | null;
  readonly at: string;
}

export interface TableStore {
  addRoll(record: TableRollRecord): Promise<void>;
  /** The latest rolls of a campaign, oldest first. */
  recentRolls(campaignId: string, limit: number): Promise<readonly TableRollRecord[]>;
  addRequest(record: CheckRequestRecord): Promise<void>;
  /** The latest requests of a campaign, newest first. */
  recentRequests(campaignId: string, limit: number): Promise<readonly CheckRequestRecord[]>;
  findRequest(campaignId: string, requestId: string): Promise<CheckRequestRecord | null>;
  /**
   * Records a request's roll and its roll in one step, only while the request is open: false when
   * it was answered or cancelled meanwhile (nothing is written then).
   */
  answerRequest(roll: TableRollRecord, total: number): Promise<boolean>;
  /** Cancels an open request; false when it is not open. */
  cancelRequest(campaignId: string, requestId: string): Promise<boolean>;
}

export class InMemoryTableStore implements TableStore {
  readonly #rolls: TableRollRecord[] = [];
  readonly #requests = new Map<string, CheckRequestRecord>();

  addRoll(record: TableRollRecord): Promise<void> {
    this.#rolls.push(record);
    return Promise.resolve();
  }

  recentRolls(campaignId: string, limit: number): Promise<readonly TableRollRecord[]> {
    return Promise.resolve(
      this.#rolls.filter((roll) => roll.campaignId === campaignId).slice(-limit),
    );
  }

  addRequest(record: CheckRequestRecord): Promise<void> {
    this.#requests.set(`${record.campaignId}\n${record.requestId}`, record);
    return Promise.resolve();
  }

  recentRequests(campaignId: string, limit: number): Promise<readonly CheckRequestRecord[]> {
    return Promise.resolve(
      [...this.#requests.values()]
        .filter((request) => request.campaignId === campaignId)
        .reverse()
        .slice(0, limit),
    );
  }

  findRequest(campaignId: string, requestId: string): Promise<CheckRequestRecord | null> {
    return Promise.resolve(this.#requests.get(`${campaignId}\n${requestId}`) ?? null);
  }

  answerRequest(roll: TableRollRecord, total: number): Promise<boolean> {
    const key = `${roll.campaignId}\n${roll.requestId ?? ''}`;
    const request = this.#requests.get(key);
    if (request?.status !== 'open') return Promise.resolve(false);
    this.#requests.set(key, { ...request, status: 'rolled', rollId: roll.rollId, total });
    this.#rolls.push(roll);
    return Promise.resolve(true);
  }

  cancelRequest(campaignId: string, requestId: string): Promise<boolean> {
    const key = `${campaignId}\n${requestId}`;
    const request = this.#requests.get(key);
    if (request?.status !== 'open') return Promise.resolve(false);
    this.#requests.set(key, { ...request, status: 'cancelled' });
    return Promise.resolve(true);
  }
}
