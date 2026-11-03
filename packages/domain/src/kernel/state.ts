import type { Possession } from '../items/records.ts';
import type {
  Attitude,
  BootstrapCampaignCommand,
  CampaignOptions,
  CharacterSheet,
  EntityKind,
  EntityStatus,
  KernelCommandType,
  Language,
  LocationType,
  StatBlock,
  Weather,
} from '@ltw/contracts';

import { EMPTY_ASSETS, type AssetState } from '../assets/records.ts';
import type { ChronicleRecord } from '../chronicle/records.ts';
import type { DeathRecord } from '../character/deaths.ts';
import type { EncounterState } from '../combat/records.ts';
import type { ReactionWindowRecord } from '../combat/reactions.ts';
import { EMPTY_EPISTEMICS, type EpistemicState } from '../contradiction/records.ts';
import { EMPTY_INVESTIGATION, type InvestigationState } from '../investigation/records.ts';
import type { KnowledgeRecord } from '../knowledge/records.ts';
import type { MemoryRecord, SessionRecord } from '../memory/records.ts';
import type { MerchantRecord } from '../items/trade.ts';

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
  /** The play language (ADR 0031); `en` for every history that never recorded one. */
  readonly language: Language;
  /** The DM's options (docs/adr/0056-characters-from-the-srd.md §3); the defaults until set. */
  readonly options: CampaignOptions;
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
  /** Character ID → controlling player actor ID; control grants are independent of prepared seats. */
  readonly roster: ReadonlyMap<string, string>;
  /** Present only in bootstrapped campaigns; never a controller or actor grant. */
  readonly preparedParty?: ReadonlySet<string>;
  readonly bootstrap?: {
    readonly source: BootstrapCampaignCommand['source'];
    readonly visualMode: 'CHOSEN' | 'TEXT_ONLY';
    readonly confirmation: BootstrapCampaignCommand['confirmation'];
  };
  /**
   * Character ID → sequence of the `CharacterAssigned` event its current assignment came from.
   * The roster is kept in this order (assignment order), so undoing a release
   * (docs/adr/0036-production-sign-in.md §4) puts the entry back exactly where it was.
   */
  readonly rosterAssignedAt: ReadonlyMap<string, number>;
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
  /** Stat blocks of non-character combatants (ADR 0015). */
  readonly statBlocks: ReadonlyMap<string, StatBlock>;
  /** The running encounter, if any (ADR 0015); positions exist only here. */
  readonly encounter: EncounterState | null;
  /** Every reaction window by ID (ADR 0016); at most one is open. */
  readonly reactionWindows: ReadonlyMap<string, ReactionWindowRecord>;
  /** NPC ID → attitude toward the party (ADR 0019 §3); absent means neutral. DM data. */
  readonly relationships: ReadonlyMap<string, Attitude>;
  /** Asset lineage (ADR 0022): requests, jobs, assets, canonical references. Never world state. */
  readonly assets: AssetState;
  /** Location ID → its own weather (ADR 0023 §1); children inherit it. Absent means unset. */
  readonly weather: ReadonlyMap<string, Weather>;
  /** Chronicle chapters (ADR 0024): records of what was told, never world facts. */
  readonly chronicles: ReadonlyMap<string, ChronicleRecord>;
  /** Item entity ID → who carries it and how (ADR 0039); absent means no record. */
  readonly possessions: ReadonlyMap<string, Possession>;
  /** A dead creature's ID → when it died (docs/adr/0056-characters-from-the-srd.md §5). */
  readonly deaths: ReadonlyMap<string, DeathRecord>;
  /** A character's ID → the portrait its player asked for, until the DM requests one (§5). */
  readonly portraitWishes: ReadonlyMap<string, string>;
  /** An NPC's ID → its shop (docs/adr/0057-encounters-maps-loot.md §8); absent: no merchant. */
  readonly merchants: ReadonlyMap<string, MerchantRecord>;
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
  rosterAssignedAt: new Map(),
  memories: new Map(),
  sessions: new Map(),
  activeSessionId: null,
  characterSheets: new Map(),
  investigation: EMPTY_INVESTIGATION,
  epistemics: EMPTY_EPISTEMICS,
  statBlocks: new Map(),
  encounter: null,
  reactionWindows: new Map(),
  relationships: new Map(),
  assets: EMPTY_ASSETS,
  weather: new Map(),
  chronicles: new Map(),
  possessions: new Map(),
  deaths: new Map(),
  portraitWishes: new Map(),
  merchants: new Map(),
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
