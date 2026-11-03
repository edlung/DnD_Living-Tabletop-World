import type { EntityKind } from '../kernel/commands.ts';
import type { KnowledgeClaim } from './claims.ts';
import type { KnowledgeRelationType, KnowledgeScope, KnowledgeType } from './commands.ts';

/**
 * Perspective-scoped knowledge views (docs/adr/0008-knowledge-boundary.md).
 * Every field is explicitly whitelisted. Non-DM views never carry canonical
 * descriptions, record metadata, or references to records or entities the
 * perspective cannot see.
 */
export interface EntityRef {
  readonly entityId: string;
  readonly kind: EntityKind;
  readonly name: string;
}

/** Provenance of a record; present only in DM views. */
export interface KnowledgeOrigin {
  readonly sequence: number;
  readonly commandId: string;
  readonly actorId: string;
  readonly recordedAt: string;
  readonly worldTime: number;
}

export interface KnowledgeView {
  readonly knowledgeId: string;
  readonly knowledgeType: KnowledgeType;
  readonly scope: KnowledgeScope;
  readonly statement: string;
  readonly subjects: readonly EntityRef[];
  readonly attributedTo: EntityRef | null;
  /** Outgoing relations whose target is visible to the same perspective. */
  readonly relations: readonly {
    readonly type: KnowledgeRelationType;
    readonly knowledgeId: string;
  }[];
  readonly knownSince: number | null;
  readonly origin?: KnowledgeOrigin;
  /** Structured claim (ADR 0014); DM views only. */
  readonly claim?: KnowledgeClaim;
}

export interface KnowledgeEdge {
  readonly from: string;
  readonly type: KnowledgeRelationType;
  readonly to: string;
}

/** HTTP response bodies of the knowledge API (docs/adr/0009-http-api-and-dev-authentication.md). */
export interface KnowledgeListResponse {
  readonly perspective: string;
  readonly asOf: number | null;
  readonly knowledge: readonly KnowledgeView[];
}

export interface KnowledgeRecordResponse {
  readonly perspective: string;
  readonly knowledge: KnowledgeView;
}

export interface RelatedKnowledgeResponse {
  readonly perspective: string;
  readonly rootId: string;
  readonly nodes: readonly KnowledgeView[];
  readonly edges: readonly KnowledgeEdge[];
}

export interface EntityKnowledgeResponse {
  readonly perspective: string;
  readonly entity: EntityRef;
  readonly knowledge: readonly KnowledgeView[];
  readonly relatedEntities: readonly EntityRef[];
}

export interface KnownEntitiesResponse {
  readonly perspective: string;
  readonly entities: readonly EntityRef[];
  /**
   * The place of the scene being played, when this perspective knows it: a viewer with no place of
   * its own (the DM, the party's view, the table's display) opens there.
   */
  readonly scenePlaceId?: string;
}

export const API_ERROR_CODES = [
  'UNAUTHENTICATED',
  'INVALID_REQUEST',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE',
  'INTERNAL',
  /** A request limit (docs/adr/0036-production-sign-in.md §6): 429 with a fixed body. */
  'RATE_LIMITED',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorResponse {
  readonly error: { readonly code: ApiErrorCode; readonly message: string };
  readonly requestId: string;
}
