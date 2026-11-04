import type { EntityRef } from '../knowledge/views.ts';
import type { CharacterDerived } from './character-derived.ts';
import type { CharacterSheet } from './character-sheet.ts';

/** Full authorized statistics; hidden concentration targets are omitted from character views. */
export interface CharacterSheetResponse {
  readonly perspective: string;
  readonly entity: EntityRef;
  readonly sheet: CharacterSheet;
  /** What the rules derive from the sheet; the server adds it (Stage 500). */
  readonly derived?: CharacterDerived;
  /**
   * The portrait its player asked for, while the DM has not requested it (docs/adr/0056-…md §5);
   * told to the DM and to the character's own player only.
   */
  readonly portraitWish?: string;
}
