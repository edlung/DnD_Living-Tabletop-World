import type {
  KnowledgeOrigin,
  KnowledgeRelation,
  KnowledgeScope,
  KnowledgeType,
} from '@ltw/contracts';

/**
 * Canonical knowledge records (docs/adr/0008-knowledge-boundary.md): one
 * holder scope per record, immutable once assigned. This is canonical data:
 * it may only reach a perspective through `projection.ts`.
 */
export interface KnowledgeRecord {
  readonly knowledgeId: string;
  readonly scope: KnowledgeScope;
  readonly knowledgeType: KnowledgeType;
  readonly statement: string;
  readonly subjects: readonly string[];
  readonly attributedTo: string | null;
  readonly relations: readonly KnowledgeRelation[];
  readonly knownSince: number | null;
  readonly origin: KnowledgeOrigin;
}

/** Stable key of a scope, e.g. `PUBLIC`, `CHARACTER:elowen-starwhisper`, `NPC:mira-vale`. */
export function scopeKey(scope: KnowledgeScope): string {
  switch (scope.kind) {
    case 'CHARACTER':
      return `CHARACTER:${scope.characterId}`;
    case 'NPC':
      return `NPC:${scope.npcId}`;
    default:
      return scope.kind;
  }
}

/** The entity holding a CHARACTER or NPC scope; null for collective scopes. */
export function holderOf(scope: KnowledgeScope): string | null {
  if (scope.kind === 'CHARACTER') return scope.characterId;
  if (scope.kind === 'NPC') return scope.npcId;
  return null;
}

/** Record types allowed in the WORLD_TRUTH scope. */
export const WORLD_TRUTH_TYPES: ReadonlySet<KnowledgeType> = new Set(['FACT', 'SECRET']);
