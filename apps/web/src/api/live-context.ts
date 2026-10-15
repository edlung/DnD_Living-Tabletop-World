import { createContext, useContext } from 'react';

/**
 * What the session's live subscription shares with the screen (docs/adr/0033-live-session.md
 * §4). The refresh counter grows by one per coalesced signal; outside a live session it stays
 * 0, so nothing reads in the background there.
 */
export const LiveRefreshContext = createContext(0);

export const useLiveRefresh = (): number => useContext(LiveRefreshContext);

/** Tells the live subscription what is shown: the selected entity and the viewed place. */
export type LiveTargetReporter = (focus: string | null, place: string | null) => void;

export const LiveTargetContext = createContext<LiveTargetReporter>(() => undefined);

export const useLiveTarget = (): LiveTargetReporter => useContext(LiveTargetContext);
