import type { ClueMethod, Disclosure, KnowledgeType } from '@ltw/contracts';

/**
 * Canonical investigation data (docs/adr/0013-investigation.md). Clues and
 * disclosure policies are DM data: no player view may depend on them.
 */
export interface Clue {
  readonly clueId: string;
  readonly entityId: string;
  readonly method: ClueMethod;
  /** Null for `inspect` and `magic`; the check total must reach it. */
  readonly dc: number | null;
  /** The EVIDENCE statement revealed to the discoverer. */
  readonly statement: string;
  readonly subjects: readonly string[];
}

export interface InvestigationState {
  readonly clues: ReadonlyMap<string, Clue>;
  /** Disclosure per NPC-held record; absent means GUARDED. */
  readonly disclosures: ReadonlyMap<string, Disclosure>;
  /** Skill-check attempts, keyed by `attemptKey`. */
  readonly attempts: ReadonlySet<string>;
  /** Clues revealed to a scope, keyed by `scopedKey(scope, clueId)`. */
  readonly revealed: ReadonlySet<string>;
  /** NPC records shared with a scope, keyed by `scopedKey(scope, knowledgeId)`. */
  readonly shared: ReadonlySet<string>;
}

export const EMPTY_INVESTIGATION: InvestigationState = {
  clues: new Map(),
  disclosures: new Map(),
  attempts: new Set(),
  revealed: new Set(),
  shared: new Set(),
};

export const attemptKey = (characterId: string, entityId: string, method: ClueMethod) =>
  `${characterId}|${entityId}|${method}`;

export const scopedKey = (scopeKey: string, id: string) => `${scopeKey}|${id}`;

/** Bounds that let the engine pre-generate every ID a command may need. */
export const MAX_CLUES_PER_METHOD = 8;
export const MAX_SHARED_PER_ASK = 8;
/** Knowledge records plus one memory. */
export const RESOLVED_ID_POOL = Math.max(MAX_CLUES_PER_METHOD, MAX_SHARED_PER_ASK) + 1;

/** Record types an NPC can never be willing to share (ADR 0013 §3). */
export const NEVER_SHAREABLE: ReadonlySet<KnowledgeType> = new Set([
  'SECRET',
  'UNKNOWN',
  'CONTRADICTION',
]);
