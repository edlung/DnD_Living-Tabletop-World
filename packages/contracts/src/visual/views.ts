import type { PlayerAssetView } from '../assets/views.ts';
import type { EntityKind, EntityStatus } from '../kernel/world-commands.ts';
import type { Condition } from '../rules/character-sheet.ts';
import type { DayPhase, Weather } from './commands.ts';

/**
 * World visual state (docs/adr/0023-world-visual-state.md; owner decisions
 * of 2026-10-04). How an entity or a place looks at a world time, resolved
 * from canonical state at that time and the entity's current approved
 * images. A perspective sees what it knows now or perceived then; state
 * details only for what it perceived then.
 */
export interface EntityPresentation {
  readonly entityId: string;
  readonly kind: EntityKind;
  /** Whether the perspective perceived it at that time; details below are null or empty otherwise. */
  readonly observed: boolean;
  readonly status: EntityStatus | null;
  /** Characters and creatures with a sheet or stat block. */
  readonly vitals: { readonly wounded: boolean; readonly unconscious: boolean } | null;
  readonly conditions: readonly Condition[];
  /** Weapons or attacks it carries, by ID. */
  readonly equipment: readonly string[];
  /** The weather it stands in (a location: its own); null indoors, unset, or unobserved. */
  readonly weather: Weather | null;
  /** The state tags its image was chosen by: the day phase, then what was observed. */
  readonly tags: readonly string[];
  /** Its current approved `image` that fits the tags best (ADR 0023 §4). */
  readonly image: PlayerAssetView | null;
  /**
   * A character, NPC or creature: its approved `figure` (the one approved last: an approval
   * supersedes the one before), the tabletop figure on the battlefield and in the scene
   * (docs/adr/0035-images.md §4 and amendments). Null for anything else.
   */
  readonly figure: PlayerAssetView | null;
  /**
   * A location: its approved top-down `battle-map` (the one approved last), the ground under
   * the encounter grid (docs/adr/0035-images.md §4 and amendments). Null for anything else.
   */
  readonly battleMap: PlayerAssetView | null;
}

/** `GET /campaigns/:campaignId/entities/:entityId/presentation?perspective=…&at=…` */
export interface EntityPresentationResponse {
  readonly perspective: string;
  readonly worldTime: number;
  readonly phase: DayPhase;
  readonly presentation: EntityPresentation;
}

/** `GET /campaigns/:campaignId/locations/:locationId/scene?perspective=…&at=…` */
export interface ScenePresentationResponse {
  readonly perspective: string;
  readonly worldTime: number;
  readonly phase: DayPhase;
  readonly location: EntityPresentation;
  /** Who and what was there, only when the perspective perceived the place at that time. */
  readonly present: readonly EntityPresentation[];
}
