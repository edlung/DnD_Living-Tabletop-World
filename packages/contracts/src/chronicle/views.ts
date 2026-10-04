import type { CommandResult } from '../kernel/results.ts';
import type { EntityRef } from '../knowledge/views.ts';
import type { KnowledgeType } from '../knowledge/commands.ts';
import type { MemoryKind } from '../memory/commands.ts';
import type { DayPhase } from '../visual/commands.ts';
import type { EntityPresentation } from '../visual/views.ts';
import type { ChronicleParagraph } from './commands.ts';

/**
 * Chronicle views (docs/adr/0024-chronicle.md). A non-DM chapter is told from
 * the perspective's own memories; each entry keeps the epistemic type of the
 * knowledge it rests on, and its sources are the events that recorded what
 * it cites. Players see event IDs only; the DM also sees sequences.
 */
export interface ChronicleSourceView {
  readonly eventId: string;
  readonly eventType: string;
  /** DM only. */
  readonly sequence?: number;
}

export interface ChronicleKnowledgeView {
  readonly knowledgeId: string;
  readonly knowledgeType: KnowledgeType;
  readonly statement: string;
}

export interface ChronicleEntryView {
  readonly key: string;
  readonly occurredAt: number;
  readonly text: string;
  readonly salience: number;
  /** A memory entry (every non-DM chapter); null for the DM's event entries. */
  readonly memoryId: string | null;
  readonly memoryKind: MemoryKind | null;
  /** The event a DM entry tells; null for memory entries. */
  readonly eventType: string | null;
  readonly location: EntityRef | null;
  readonly participants: readonly EntityRef[];
  /** What the entry rests on, with its epistemic type: an account is not a fact. */
  readonly knowledge: readonly ChronicleKnowledgeView[];
  readonly sources: readonly ChronicleSourceView[];
}

export interface ChronicleChapterView {
  readonly chronicleId: string;
  readonly title: string;
  readonly perspective: string;
  readonly from: number;
  readonly to: number;
  /** The world time it was generated at. */
  readonly generatedAt: number;
  readonly entries: readonly ChronicleEntryView[];
  readonly prose: {
    readonly provider: string;
    readonly model: string;
    /** DM only; null otherwise. */
    readonly traceId: string | null;
    readonly paragraphs: readonly ChronicleParagraph[];
  };
}

/** `GET /campaigns/:campaignId/chronicle?perspective=…` */
export interface ChronicleListResponse {
  readonly perspective: string;
  readonly chapters: readonly ChronicleChapterView[];
}

/** `POST /campaigns/:campaignId/chronicle` (DM only). */
export interface GenerateChronicleRequest {
  readonly title: string;
  readonly perspective: string;
  readonly from: number;
  readonly to?: number;
}

export interface GenerateChronicleResponse {
  readonly result: CommandResult;
  readonly chronicleId: string | null;
  readonly rendering: {
    readonly status: 'RENDERED' | 'AI_UNAVAILABLE' | 'INVALID_OUTPUT' | 'NOTHING_TO_TELL';
    readonly provider: string | null;
    readonly traceId: string | null;
  };
}

/** A memory the DM may record for a salient moment its scope has no memory of. */
export interface MemorySuggestionView {
  readonly suggestionId: string;
  readonly occurredAt: number;
  readonly reason: 'battle' | 'contradiction' | 'arrival' | 'new-day';
  readonly sources: readonly ChronicleSourceView[];
  /** A `RecordMemory` command to review; it is checked like any other when submitted. */
  readonly command: Readonly<Record<string, unknown>>;
}

/** `GET /campaigns/:campaignId/chronicle/suggestions?scope=PARTY&from=…&to=…` (DM only). */
export interface MemorySuggestionsResponse {
  readonly scope: string;
  readonly suggestions: readonly MemorySuggestionView[];
}

/** `GET /campaigns/:campaignId/memories/:memoryId/flashback?perspective=…` */
export interface FlashbackResponse {
  readonly perspective: string;
  readonly memoryId: string;
  readonly worldTime: number;
  readonly phase: DayPhase;
  /** The place as the perspective saw it then; null when it may not see it. */
  readonly scene: EntityPresentation | null;
  readonly participants: readonly {
    readonly entity: EntityRef;
    readonly presentation: EntityPresentation | null;
  }[];
  readonly dialogue: {
    readonly text: string;
    /** The type of the record quoted; null when the memory's own summary is shown. */
    readonly knowledgeType: KnowledgeType | null;
    readonly speaker: EntityRef | null;
  };
  readonly sources: readonly ChronicleSourceView[];
}
