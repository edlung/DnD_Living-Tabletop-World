import type { Accounting, AttemptSummary } from './eval-world.ts';

/**
 * One evaluated request as reported (docs/STAGE_300_REMEDIATION_DESIGN.md §4; ADR 0032,
 * checkpoint C): semantic verdict, technical outcome, lexical and isolation checks, latency and
 * accounting, kept apart.
 */
export const CAPABILITIES = ['reasoning', 'npc-dialogue', 'narrative', 'fast-context'] as const;
export type Capability = (typeof CAPABILITIES)[number];

export interface Row {
  readonly case: string;
  readonly semantic: {
    /** Null: not judged by any oracle (human or independent assessment). */
    readonly pass: boolean | null;
    readonly outcome: string;
    readonly reason: string | null;
  };
  readonly technical: {
    /** The public status the caller saw. */
    readonly status: string;
    /**
     * The configured remote provider produced the accepted answer (no local fallback): a valid
     * result, or a schema-valid deliberate intent decline (`NO_PROPOSAL`).
     */
    readonly remoteValid: boolean;
    readonly attempts: readonly AttemptSummary[];
  };
  /** Lexical output scan: forbidden phrases found verbatim (dialogue only). */
  readonly lexicalLeaks?: readonly string[];
  /** Chronicle only: who wrote the committed prose, and every rejected model answer's causes. */
  readonly chronicle?: {
    readonly authorship: string;
    readonly rejections: readonly { readonly kind: string; readonly causes: readonly string[] }[];
  };
  /**
   * The exact provider input, checked apart from the output. Dialogue adds allowed content
   * missing from the input and whether the recorded sources equal the context builder's.
   */
  readonly isolation?: {
    readonly inspected: boolean;
    readonly leaks: readonly string[];
    readonly missing?: readonly string[];
    readonly sourcesMatch?: boolean | null;
  };
  readonly endToEndMs: number;
  readonly traceId: string | null;
  readonly accounting: Accounting;
  readonly note: string;
  readonly reply?: string;
}

export interface CapabilityResult {
  readonly rows: readonly Row[];
  /** The effective relevance deadline (configuration), for relevance rows. */
  readonly deadlineMs?: number;
}

export const remoteValid = (attempts: readonly AttemptSummary[]) => {
  const last = attempts.at(-1);
  if (last === undefined || last.provider === 'local') return false;
  return (
    last.outcome === 'valid' ||
    (last.outcome === 'invalid' && last.issues.length === 1 && last.issues[0] === 'NO_PROPOSAL')
  );
};
