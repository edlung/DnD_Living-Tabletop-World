import type { EntityRef } from '../knowledge/views.ts';

/**
 * Live session (docs/adr/0033-live-session.md; docs/STAGE_310_DESIGN.md §A). The change
 * signal `GET /campaigns/:campaignId/live?perspective=…[&focus=…][&place=…]` is an event
 * stream of these fixed messages only: never world content, a credential, an event
 * position or a world version.
 */
export const LIVE_CLOSE_REASONS = [
  'unauthenticated',
  'forbidden',
  'gone',
  'overloaded',
  'shutdown',
] as const;
export type LiveCloseReason = (typeof LIVE_CLOSE_REASONS)[number];

/** The client does not reconnect after these: the credential or the perspective was refused. */
export const LIVE_FINAL_REASONS: readonly LiveCloseReason[] = ['unauthenticated', 'forbidden'];

export type LiveMessage =
  /** The subscription is registered and its baseline taken: reload every shown view. */
  | { readonly type: 'ready' }
  /** Something this subscription may read changed; `seq` counts this subscription's signals. */
  | { readonly type: 'changed'; readonly seq: number }
  /** The stream ends. */
  | { readonly type: 'closed'; readonly reason: LiveCloseReason };

/** One character of the perspective's own `entities` view. */
export interface PresenceEntry {
  readonly character: EntityRef;
  /** Whether the character's controlling player has a live subscription (10 s grace). */
  readonly present: boolean;
}

/**
 * `GET /campaigns/:campaignId/presence?perspective=…`: only characters the perspective's own
 * entity view lists, never an actor ID. Shown, never used to decide anything.
 */
export interface PresenceResponse {
  readonly perspective: string;
  readonly dmConnected: boolean;
  readonly characters: readonly PresenceEntry[];
}
