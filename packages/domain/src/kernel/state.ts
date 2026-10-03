import type {
  CharacterSheet,
  EntityKind,
  EntityStatus,
  KernelCommandType,
  LocationType,
} from '@ltw/contracts';

import { EMPTY_EPISTEMICS, type EpistemicState } from '../contradiction/records.ts';
import { EMPTY_INVESTIGATION, type InvestigationState } from '../investigation/records.ts';
import type { KnowledgeRecord } from '../knowledge/records.ts';
import type { MemoryRecord, SessionRecord } from '../memory/records.ts';

/**
 * Canonical World Kernel state: the fold of a campaign's event stream
 * (docs/adr/0007-world-kernel-model-and-event-store.md). Never mutated in
 * place; `evolve` returns a new state. Maps (not records) are used so that
 * user-chosen IDs can never collide with object prototype members.
 */
export interface CampaignState {
  readonly campaignId: string;
  readonly name: string;
  readonly worldName: string;
  readonly startsAt: number;
  readonly dmActorId: string;
}

export interface LocationInfo {
  readonly type: LocationType;
  readonly parentId: string | null;
}

export interface Placement {
  readonly locationId: string;
  /** World time the placement began; `null` = before recorded history. */
  readonly since: number | null;
}

export interface EntityState {
  readonly entityId: string;
  readonly kind: EntityKind;
  readonly name: string;
  readonly description: string;
  readonly existsSince: number | null;
  readonly location: LocationInfo | null;
  readonly placement: Placement | null;
  readonly status: EntityStatus;
}

export interface SceneState {
  readonly sceneId: string;
  readonly title: string;
  readonly locationId: string;
  readonly startedAt: number;
  readonly endedAt: number | null;
}

export interface CommandTrace {
  readonly commandId: string;
  readonly commandType: KernelCommandType;
  readonly firstSequence: number;
  readonly lastSequence: number;
  /** Command ID of the `UndoCommand` that compensated this command, if any. */
  readonly undoneBy: string | null;
}

export interface WorldState {
  readonly campaign: CampaignState | null;
  /** Sequence of the last applied event; 0 for an empty stream. */
  readonly version: number;
  /** Current world time. */
  readonly clock: number;
  readonly activeSceneId: string | null;
  readonly entities: ReadonlyMap<string, EntityState>;
  readonly scenes: ReadonlyMap<string, SceneState>;
  /** Every entity/scene/knowledge ID ever created, including undone ones (never reused). */
  readonly usedIds: ReadonlySet<string>;
  readonly commands: ReadonlyMap<string, CommandTrace>;
  /** Knowledge records by ID (ADR 0008); canonical, never projected directly. */
  readonly knowledge: ReadonlyMap<string, KnowledgeRecord>;
  /** Character ID → controlling player actor ID; assigned characters form the party. */
  readonly roster: ReadonlyMap<string, string>;
  /** Memories by ID (ADR 0010); canonical, never projected directly. */
  readonly memories: ReadonlyMap<string, MemoryRecord>;
  readonly sessions: ReadonlyMap<string, SessionRecord>;
  readonly activeSessionId: string | null;
  /** Character sheets by entity ID (ADR 0011). */
  readonly characterSheets: ReadonlyMap<string, CharacterSheet>;
  /** Clues, disclosure, attempts, revealed clues, shared records (ADR 0013). */
  readonly investigation: InvestigationState;
  /** Claims and recorded contradictions (ADR 0014). */
  readonly epistemics: EpistemicState;
}

export const EMPTY_WORLD_STATE: WorldState = {
  campaign: null,
  version: 0,
  clock: 0,
  activeSceneId: null,
  entities: new Map(),
  scenes: new Map(),
  usedIds: new Set(),
  commands: new Map(),
  knowledge: new Map(),
  roster: new Map(),
  memories: new Map(),
  sessions: new Map(),
  activeSessionId: null,
  characterSheets: new Map(),
  investigation: EMPTY_INVESTIGATION,
  epistemics: EMPTY_EPISTEMICS,
};

/** Kinds that occupy a location. Locations nest via `parentId`; factions are abstract. */
export const PLACEABLE_KINDS: ReadonlySet<EntityKind> = new Set([
  'character',
  'npc',
  'creature',
  'item',
  'feature',
]);

/** Statuses an entity of each kind may have. */
export const STATUSES_BY_KIND: Readonly<Record<EntityKind, readonly EntityStatus[]>> = {
  character: ['active', 'dead'],
  npc: ['active', 'dead'],
  creature: ['active', 'dead'],
  item: ['active', 'destroyed'],
  feature: ['active', 'destroyed'],
  location: ['active', 'destroyed'],
  faction: ['active'],
};
