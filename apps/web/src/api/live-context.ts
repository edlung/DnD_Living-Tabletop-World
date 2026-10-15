import { createContext, useContext } from 'react';

/**
 * What the session's live subscription shares with the screen (docs/adr/0033-live-session.md
 * §4). The refresh counter grows by one per coalesced signal; outside a live session it stays
 * 0, so nothing reads in the background there.
 */
export const LiveRefreshContext = createContext(0);

export const useLiveRefresh = (): number => useContext(LiveRefreshContext);

/** Whether a live session is open around the screen (false in tests and outside a session). */
export const LiveActiveContext = createContext(false);

export const useLiveActive = (): boolean => useContext(LiveActiveContext);

/**
 * After a read the server did not signal (a first load, a reload after the viewer's own action,
 * an explicit re-read), one more background read follows once a comparison cycle (1 s) has
 * surely passed. A change undone within one cycle never reaches the fingerprint, so without this
 * a screen that read the state in between could keep it (Stage 310 part A limitation).
 */
export const TRAILING_REREAD_MS = 1_500;

/** Tells the live subscription what is shown: the selected entity and the viewed place. */
export type LiveTargetReporter = (focus: string | null, place: string | null) => void;

export const LiveTargetContext = createContext<LiveTargetReporter>(() => undefined);

export const useLiveTarget = (): LiveTargetReporter => useContext(LiveTargetContext);
