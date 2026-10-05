import type { EntityRef } from '../knowledge/views.ts';
import type { CharacterSheet } from './character-sheet.ts';

/** Full authorized statistics; hidden concentration targets are omitted from character views. */
export interface CharacterSheetResponse {
  readonly perspective: string;
  readonly entity: EntityRef;
  readonly sheet: CharacterSheet;
}
