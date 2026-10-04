import type { KnowledgeClaim, KnowledgeScope, KnowledgeType } from '@ltw/contracts';

/**
 * Canonical epistemic data (docs/adr/0014-contradictions-and-epistemic-integrity.md).
 * Claims are DM data: no non-DM view, outcome, or context may expose them.
 */
export type Claim = KnowledgeClaim;

/** Scopes that have an audience below the DM: the only places claims and contradictions live. */
export type HolderScope = Extract<
  KnowledgeScope,
  { kind: 'PUBLIC' | 'PARTY' | 'CHARACTER' | 'NPC' }
>;

export interface EpistemicState {
  /** Claims on knowledge records, by knowledge ID. */
  readonly claims: ReadonlyMap<string, Claim>;
  /** Claims on clues, copied to every record the clue reveals later. */
  readonly clueClaims: ReadonlyMap<string, Claim>;
  /** Recorded contradictions: `pairKey` → the CONTRADICTION record's ID. */
  readonly contradictions: ReadonlyMap<string, string>;
}

export const EMPTY_EPISTEMICS: EpistemicState = {
  claims: new Map(),
  clueClaims: new Map(),
  contradictions: new Map(),
};

/** Record types that assert something; questions and contradictions do not. */
export const CLAIMABLE_TYPES: ReadonlySet<KnowledgeType> = new Set([
  'FACT',
  'EVIDENCE',
  'TESTIMONY',
  'RUMOR',
  'INFERENCE',
  'HYPOTHESIS',
  'SECRET',
]);

export const isHolderScope = (scope: KnowledgeScope): scope is HolderScope =>
  scope.kind === 'PUBLIC' ||
  scope.kind === 'PARTY' ||
  scope.kind === 'CHARACTER' ||
  scope.kind === 'NPC';

/**
 * Scopes whose records may carry a claim: the holder scopes, and world truth
 * for continuity only (ADR 0019 §4; detection never joins it).
 */
export const carriesClaims = (scope: KnowledgeScope): boolean =>
  isHolderScope(scope) || scope.kind === 'WORLD_TRUTH';

/** One contradiction per unordered pair of records per scope. */
export function pairKey(scopeKey: string, first: string, second: string): string {
  const [a, b] = first < second ? [first, second] : [second, first];
  return `${scopeKey}|${a}|${b}`;
}

/** True if two claims disagree: same subject and aspect, different value. */
export const conflicts = (a: Claim, b: Claim): boolean =>
  a.subjectId === b.subjectId && a.aspect === b.aspect && a.value !== b.value;
