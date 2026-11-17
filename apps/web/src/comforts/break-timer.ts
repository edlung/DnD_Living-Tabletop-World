import { castSchema, type Cast } from '@ltw/contracts';

/**
 * How long the table has played since its last break, as the DM's own screen counts it
 * (docs/adr/0072-keepsakes.md §3). A convenience of this browser: nothing is sent or stored on
 * the server, and no screen but the DM's knows of it. Play counts while a session is open and
 * not paused and this screen is there to see it; a pause of five minutes, or ten minutes with
 * the screen away (a laptop closed, a campaign left open overnight), is a break already.
 */
export interface BreakState {
  readonly sessionId: string;
  /** Milliseconds of play counted since the last break. */
  readonly played: number;
  /** When the count was last looked at. */
  readonly seenAt: number;
  /** Since when the game has stood paused; null while it plays. */
  readonly pausedAt: number | null;
  /** A break called from the reminder is on: it lasts while the game stays paused. */
  readonly onBreak: boolean;
  /** A screen of the table says "Break": false where there is none, or none could be told. */
  readonly shown: boolean;
  /** What the cast was before the break changed it, to show again after; null when it did not. */
  readonly resume: Cast | null;
  /** "Later": the play counted at which the reminder asks again; 0 when it was not put off. */
  readonly askAt: number;
  /** The break's pause was asked for and has not been read back from the table yet. */
  readonly awaited: boolean;
}

/** A pause this long is a break: the count starts again. */
export const REST_MS = 5 * 60_000;
/** Nobody watched for this long: the table was not playing, and the count starts again. */
export const AWAY_MS = 10 * 60_000;
/** "Later" asks again after this long. */
export const LATER_MS = 15 * 60_000;
/** How often the DM's screen looks at the clock. */
export const TICK_MS = 30_000;
/** How long a pause just asked for is waited for before a playing game ends the break. */
export const SETTLE_MS = 10_000;

export interface Observation {
  /** The open session; null between sessions. */
  readonly sessionId: string | null;
  readonly paused: boolean;
  readonly now: number;
}

/** The count after one more look at the table. Null between sessions: there is nothing to count. */
export function advance(state: BreakState | null, seen: Observation): BreakState | null {
  if (seen.sessionId === null) return null;
  if (state === null || state.sessionId !== seen.sessionId) {
    return {
      sessionId: seen.sessionId,
      played: 0,
      seenAt: seen.now,
      pausedAt: seen.paused ? seen.now : null,
      onBreak: false,
      shown: false,
      resume: null,
      askAt: 0,
      awaited: false,
    };
  }
  if (seen.paused) {
    return { ...state, awaited: false, seenAt: seen.now, pausedAt: state.pausedAt ?? seen.now };
  }
  if (state.onBreak) {
    // The pause just asked for may not have been read back yet; once it has, a game that plays
    // again — resumed from the card or from the Session sheet — means the break is over.
    const early = state.awaited && state.pausedAt !== null && seen.now - state.pausedAt < SETTLE_MS;
    return early ? { ...state, seenAt: seen.now } : breakOver(state, seen.now);
  }
  if (state.pausedAt !== null) {
    const rested = seen.now - state.pausedAt >= REST_MS;
    return rested
      ? { ...state, played: 0, askAt: 0, seenAt: seen.now, pausedAt: null }
      : { ...state, seenAt: seen.now, pausedAt: null };
  }
  const since = seen.now - state.seenAt;
  // A long gap is a break taken away from the screen; a clock set back counts nothing.
  return since >= AWAY_MS
    ? { ...state, played: 0, askAt: 0, seenAt: seen.now }
    : { ...state, played: state.played + Math.max(0, since), seenAt: seen.now };
}

/** Whether it is time to offer a break: `after` minutes of play, none offered while one is on. */
export const breakDue = (state: BreakState | null, after: number): boolean =>
  state !== null &&
  after > 0 &&
  !state.onBreak &&
  state.pausedAt === null &&
  state.played >= Math.max(after * 60_000, state.askAt);

/** Minutes played, to the nearest five: the words stay round, and Russian keeps one plural. */
export const minutesPlayed = (state: BreakState): number =>
  Math.max(5, Math.round(state.played / 300_000) * 5);

/** "Later": the reminder comes back after a quarter of an hour more of play, and says how long. */
export const askLater = (state: BreakState): BreakState => ({
  ...state,
  askAt: state.played + LATER_MS,
});

/** The break begins: the game is paused, and the screens say so where there are any to tell. */
export const breakBegun = (
  state: BreakState,
  screens: { readonly shown: boolean; readonly resume: Cast | null },
  now: number,
): BreakState => ({
  ...state,
  onBreak: true,
  shown: screens.shown,
  resume: screens.resume,
  awaited: true,
  pausedAt: now,
  seenAt: now,
});

/** The table is back: the count starts again. */
export const breakOver = (state: BreakState, now: number): BreakState => ({
  ...state,
  played: 0,
  askAt: 0,
  onBreak: false,
  shown: false,
  resume: null,
  awaited: false,
  pausedAt: null,
  seenAt: now,
});

const KEY = 'ltw.break:';
const time = (value: unknown): value is number => typeof value === 'number' && value >= 0;

/** What this browser kept for the campaign; null when nothing, or nothing that reads as a count. */
export function parseBreak(text: string | null): BreakState | null {
  try {
    const stored = JSON.parse(text ?? 'null') as Partial<BreakState> | null;
    if (!stored || typeof stored !== 'object') return null;
    if (typeof stored.sessionId !== 'string' || !time(stored.played) || !time(stored.seenAt)) {
      return null;
    }
    const resume = castSchema.safeParse(stored.resume);
    return {
      sessionId: stored.sessionId,
      played: stored.played,
      seenAt: stored.seenAt,
      pausedAt: time(stored.pausedAt) ? stored.pausedAt : null,
      onBreak: stored.onBreak === true,
      shown: stored.shown === true,
      resume: resume.success ? resume.data : null,
      askAt: time(stored.askAt) ? stored.askAt : 0,
      awaited: stored.awaited === true,
    };
  } catch {
    return null;
  }
}

export function readBreak(campaignId: string): BreakState | null {
  try {
    return parseBreak(window.localStorage.getItem(KEY + campaignId));
  } catch {
    return null;
  }
}

export function writeBreak(campaignId: string, state: BreakState | null): void {
  try {
    if (state === null) window.localStorage.removeItem(KEY + campaignId);
    else window.localStorage.setItem(KEY + campaignId, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (a private window): the count holds for this page.
  }
}
