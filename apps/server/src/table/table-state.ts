import type { TableDice, TableMode } from '@ltw/contracts';

/**
 * The table's state around a session (docs/adr/0043-dm-screen.md §6): whether it plays at the
 * table or online, whether the DM paused the game, and which characters' players are absent —
 * presentation and table control beside the world, never canonical (the session's start and end
 * are the World Engine's). Players' "ready" before a session lives in memory only: it says who
 * has sat down, and a restart simply asks again.
 */

export interface TableState {
  readonly mode: TableMode;
  readonly paused: boolean;
  readonly absent: readonly string[];
  /** The campaign's dice: the app's, or the players' own entered (ADR 0044 §4, migration 0031). */
  readonly dice: TableDice;
}

export const FRESH_TABLE: TableState = { mode: 'table', paused: false, absent: [], dice: 'app' };

export interface TableStateStore {
  read(campaignId: string): Promise<TableState>;
  write(campaignId: string, state: TableState, at: string): Promise<void>;
}

export class InMemoryTableStateStore implements TableStateStore {
  readonly #states = new Map<string, TableState>();

  read(campaignId: string): Promise<TableState> {
    return Promise.resolve(this.#states.get(campaignId) ?? FRESH_TABLE);
  }

  write(campaignId: string, state: TableState): Promise<void> {
    this.#states.set(campaignId, { ...state, absent: [...state.absent] });
    return Promise.resolve();
  }
}

/**
 * Who said "ready" before a session, with the session open at the time (none): a session's start
 * makes every earlier "ready" stale without anyone clearing it.
 */
export class ReadyRegistry {
  readonly #ready = new Map<string, Map<string, string | null>>();

  set(campaignId: string, characterId: string, ready: boolean, session: string | null): void {
    const campaign = this.#ready.get(campaignId) ?? new Map<string, string | null>();
    if (ready) campaign.set(characterId, session);
    else campaign.delete(characterId);
    this.#ready.set(campaignId, campaign);
  }

  /** The characters ready while this session (or none) is the open one. */
  readyFor(campaignId: string, session: string | null): ReadonlySet<string> {
    const campaign = this.#ready.get(campaignId);
    if (!campaign) return new Set();
    return new Set([...campaign].filter(([, at]) => at === session).map(([id]) => id));
  }
}

export interface LobbyDependencies {
  readonly state: TableStateStore;
  readonly ready: ReadyRegistry;
  readonly now: () => string;
}

export const memoryLobby = (): LobbyDependencies => ({
  state: new InMemoryTableStateStore(),
  ready: new ReadyRegistry(),
  now: () => new Date().toISOString(),
});
