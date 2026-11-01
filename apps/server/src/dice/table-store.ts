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

/** An open short rest the DM called (Stage 530): players spend hit dice until the DM ends it. */
export interface RestRecord {
  readonly restId: string;
  readonly campaignId: string;
  readonly kind: 'short';
  readonly startedAt: string;
  readonly endedAt: string | null;
}

/** The DM's short rests (migration 0026): at most one open per campaign. */
export interface RestStore {
  openRest(campaignId: string): Promise<RestRecord | null>;
  /** False when a rest is already open (nothing is written then). */
  startRest(record: RestRecord): Promise<boolean>;
  /** False when that rest is not open. */
  endRest(campaignId: string, restId: string, at: string): Promise<boolean>;
}

export class InMemoryRestStore implements RestStore {
  readonly #rests: RestRecord[] = [];

  openRest(campaignId: string): Promise<RestRecord | null> {
    return Promise.resolve(
      this.#rests.find((rest) => rest.campaignId === campaignId && rest.endedAt === null) ?? null,
    );
  }

  async startRest(record: RestRecord): Promise<boolean> {
    if (await this.openRest(record.campaignId)) return false;
    this.#rests.push(record);
    return true;
  }

  endRest(campaignId: string, restId: string, at: string): Promise<boolean> {
    const index = this.#rests.findIndex(
      (rest) => rest.campaignId === campaignId && rest.restId === restId && rest.endedAt === null,
    );
    const rest = this.#rests[index];
    if (!rest) return Promise.resolve(false);
    this.#rests[index] = { ...rest, endedAt: at };
    return Promise.resolve(true);
  }
}
