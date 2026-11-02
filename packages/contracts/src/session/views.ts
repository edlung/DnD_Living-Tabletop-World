import type { EntityRef } from '../knowledge/views.ts';
import type { Language } from '../language/language.ts';

/** Caller identity and permitted views, derived from authentication and the current roster. */
export interface SessionResponse {
  readonly actorId: string;
  readonly role: 'DM' | 'PLAYER';
  /** The player's first character (the PLAYER perspective's). */
  readonly character: EntityRef | null;
  /** Every character the player holds, the first first (docs/adr/0044-online-play.md §6). */
  readonly characters: readonly EntityRef[];
  readonly campaign: {
    readonly campaignId: string;
    readonly name: string;
    /** The campaign's play language (ADR 0031); the client chooses its dictionary from it. */
    readonly language: Language;
  };
  readonly perspectives: readonly { readonly value: string; readonly label: string }[];
}
