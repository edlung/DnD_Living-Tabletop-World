import type { EntityRef } from '../knowledge/views.ts';

/** Caller identity and permitted views, derived from authentication and the current roster. */
export interface SessionResponse {
  readonly actorId: string;
  readonly role: 'DM' | 'PLAYER';
  readonly character: EntityRef | null;
  readonly campaign: { readonly campaignId: string; readonly name: string };
  readonly perspectives: readonly { readonly value: string; readonly label: string }[];
}
