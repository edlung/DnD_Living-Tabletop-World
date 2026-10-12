import type {
  ChronicleChapterView,
  ContextAction,
  DmIntentResponse,
  EntityContextResponse,
  Language,
} from '@ltw/contracts';
import { HEDGED_TYPES, chronicleText } from '@ltw/domain';

import { GUARDED_BY, NEVER_SAID, SAYABLE_BY, type EvalNpc } from './cases.ts';
import type { Command, IntentCase } from './intent-cases.ts';

/**
 * Evaluation oracles (docs/STAGE_300_REMEDIATION_DESIGN.md §4; ADR 0032, checkpoint C). Each
 * keeps four questions apart: semantic correctness (did it do what was asked, or deliberately
 * decline what should be declined), safe decline, technical provider success (reported by the
 * runner from traces), and quality, which no oracle here judges. Lexical checks are labelled as
 * lexical: a marker scan cannot prove semantic fidelity or rule out a paraphrased secret.
 */

export type IntentOutcome =
  /** A proposal that does exactly what was asked (or, for an expected decline, a legitimate one). */
  | 'correct-proposal'
  /** A deliberate decline (`INVALID_OUTPUT` with `NO_PROPOSAL`): safe, correct only if expected. */
  | 'safe-decline'
  | 'wrong-proposal'
  /** No proposal and no deliberate decline: unavailable, or output that failed its schema. */
  | 'no-answer';

export interface IntentVerdict {
  readonly outcome: IntentOutcome;
  /** Whether the answer is semantically what the case asks for. */
  readonly semanticPass: boolean;
  readonly reason: string | null;
}

export function intentVerdict(
  testCase: IntentCase,
  response: Pick<DmIntentResponse, 'status' | 'proposal' | 'issues'>,
): IntentVerdict {
  if (response.status === 'PROPOSED' && response.proposal !== null) {
    const commands = response.proposal.commands as unknown as readonly Command[];
    const reason = testCase.check(commands);
    return reason === null
      ? { outcome: 'correct-proposal', semanticPass: true, reason: null }
      : { outcome: 'wrong-proposal', semanticPass: false, reason };
  }
  // Only the deliberate decline branch counts; a schema failure is not a decline.
  if (response.status === 'INVALID_OUTPUT' && response.issues.includes('NO_PROPOSAL')) {
    return {
      outcome: 'safe-decline',
      semanticPass: testCase.expect === 'decline',
      reason: testCase.expect === 'decline' ? null : 'declined a legitimate change',
    };
  }
  return { outcome: 'no-answer', semanticPass: false, reason: response.status };
}

/**
 * What an NPC must never say or be given (lexical phrases): planted secrets, other NPCs' facts,
 * and its own guarded content unless the context builder unlocked it for this request (the
 * phrase is in the rebuilt context; with no rebuilt context, guarded content stays forbidden).
 */
export function forbiddenFor(npc: EvalNpc, contextText: string | null): readonly string[] {
  const guarded = GUARDED_BY[npc].filter(
    (phrase) => contextText === null || !contextText.includes(phrase),
  );
  return [...NEVER_SAID['*'], ...NEVER_SAID[npc], ...guarded];
}

/** Lexical: every forbidden phrase found verbatim (case-insensitively) in `text`. */
export function lexicalLeaks(text: string, forbidden: readonly string[]): string[] {
  const lower = text.toLocaleLowerCase('ru');
  return forbidden.filter((phrase) => lower.includes(phrase.toLocaleLowerCase('ru')));
}

/** The planted record and entity IDs of the Gate 04 boundary, which no NPC request may carry. */
export const BOUNDARY_IDS: readonly string[] = [
  'nb-hooded-watcher',
  'nb-truth',
  'nb-dm-note',
  'nb-orin-secret',
  'nb-orin-willing',
  'nb-mira-willing',
  'nb-party-note',
  'nb-elowen-note',
];

export interface IsolationVerdict {
  /** False when no provider request was sent (local or deterministic): nothing to inspect. */
  readonly inspected: boolean;
  readonly leaks: readonly string[];
}

/**
 * Intents (PUBLIC context): lexical only, the exact provider requests must not carry a planted
 * marker or a boundary ID.
 */
export function isolationVerdict(
  bodies: readonly string[],
  forbidden: readonly string[],
): IsolationVerdict {
  if (bodies.length === 0) return { inspected: false, leaks: [] };
  const leaks = new Set<string>();
  for (const body of bodies) {
    for (const leak of lexicalLeaks(body, [...forbidden, ...BOUNDARY_IDS])) leaks.add(leak);
  }
  return { inspected: true, leaks: [...leaks] };
}

export interface DialogueIsolation extends IsolationVerdict {
  /** Allowed content the builder exposed (`sayableBy` markers in it) absent from the input. */
  readonly missing: readonly string[];
  /**
   * ID-level: the request's recorded sources equal the sources the context builder exposes for it
   * (`dialogueSourceIds` of the rebuilt context). Null when either is unavailable.
   */
  readonly sourcesMatch: boolean | null;
}

/**
 * NPC dialogue isolation (Gate 04, design §4), checked on the exact provider requests apart from
 * the reply, against the context the builder exposes for that request (rebuilt by the runner with
 * the route's own domain functions):
 * - exact, by ID: the recorded sources equal the builder's; no boundary or source ID in the input;
 * - lexical, by phrase: no planted secret, other NPC's fact or locked guarded content in the input
 *   (the player's own words excepted), and every `sayableBy` marker the builder exposed is present.
 * A paraphrase of a secret would pass the phrase scan; the source comparison is what bounds the
 * input to the builder's context.
 */
export function dialogueIsolation(input: {
  readonly npc: EvalNpc;
  readonly bodies: readonly string[];
  readonly line: string | null;
  readonly context: { readonly text: string; readonly sourceIds: readonly string[] } | null;
  readonly traceSourceIds: readonly string[] | null;
}): DialogueIsolation {
  const { context, traceSourceIds } = input;
  const sourcesMatch =
    context === null || traceSourceIds === null
      ? null
      : new Set(traceSourceIds).size === new Set(context.sourceIds).size &&
        traceSourceIds.every((id) => context.sourceIds.includes(id));
  if (input.bodies.length === 0) return { inspected: false, leaks: [], missing: [], sourcesMatch };
  const forbidden = forbiddenFor(input.npc, context?.text ?? null);
  const ids = [...BOUNDARY_IDS, ...(context?.sourceIds ?? [])];
  const sayable = SAYABLE_BY[input.npc].filter((marker) => context?.text.includes(marker));
  const leaks = new Set<string>();
  const missing = new Set<string>();
  for (const raw of input.bodies) {
    // The player's own words are theirs to say (as in the Gate 04 tests).
    const body =
      input.line === null
        ? raw
        : raw.replaceAll(JSON.stringify(input.line).slice(1, -1), '').replaceAll(input.line, '');
    for (const leak of lexicalLeaks(body, forbidden)) leaks.add(leak);
    for (const id of ids) if (body.includes(id)) leaks.add(id);
    for (const marker of sayable) if (!body.includes(marker)) missing.add(marker);
  }
  return { inspected: true, leaks: [...leaks], missing: [...missing], sourcesMatch };
}

export interface ChronicleVerdict {
  /** Every cited key is an entry of the chapter. */
  readonly citationsValid: boolean;
  /** Lexical: every paragraph citing an account or guess says so in the campaign's words. */
  readonly hedgesPresent: boolean;
  /** Every entry is told by some paragraph. */
  readonly entriesCovered: boolean;
  readonly issues: readonly string[];
}

export function chronicleVerdict(
  chapter: Pick<ChronicleChapterView, 'entries'> & {
    readonly prose: Pick<ChronicleChapterView['prose'], 'paragraphs'>;
  },
  language: Language,
): ChronicleVerdict {
  const { hedge } = chronicleText(language);
  const byKey = new Map(chapter.entries.map((entry) => [entry.key, entry]));
  const issues: string[] = [];
  let citationsValid = true;
  let hedgesPresent = true;
  chapter.prose.paragraphs.forEach((paragraph, index) => {
    const wrong = paragraph.cites.filter((key) => !byKey.has(key));
    if (wrong.length > 0 || paragraph.cites.length === 0) {
      citationsValid = false;
      issues.push(`paragraph ${String(index + 1)}: cites no entry of this chapter`);
    }
    const hedged = paragraph.cites.some((key) =>
      (byKey.get(key)?.knowledge ?? []).some(({ knowledgeType }) =>
        HEDGED_TYPES.has(knowledgeType),
      ),
    );
    if (hedged && !hedge.test(paragraph.text)) {
      hedgesPresent = false;
      issues.push(`paragraph ${String(index + 1)}: tells an account as fact (lexical)`);
    }
  });
  const cited = new Set(chapter.prose.paragraphs.flatMap((paragraph) => paragraph.cites));
  const entriesCovered = chapter.entries.every((entry) => cited.has(entry.key));
  if (!entriesCovered) issues.push('an entry is told by no paragraph');
  return { citationsValid, hedgesPresent, entriesCovered, issues };
}

/** Who wrote the committed chapter's prose, for the model's semantic verdict. */
export type ChronicleAuthorship =
  /** The configured remote model's validated prose. */
  | 'model'
  /** The model answered, validation rejected it, and the template was committed. */
  | 'model-rejected'
  /** The template with no model output (unavailable, refused, denied, no route, no start). */
  | 'template'
  /** The deterministic local provider (offline, a local route or a switch): not a model. */
  | 'local';

export interface ChronicleModelVerdict {
  readonly authorship: ChronicleAuthorship;
  /** Null when no model output exists to judge: a template or local chapter is never a model pass. */
  readonly pass: boolean | null;
  readonly outcome: string;
  readonly reason: string | null;
  /** Each rejected model answer and why validation rejected it (before any commit). */
  readonly rejections: readonly { readonly kind: string; readonly causes: readonly string[] }[];
}

/** The cause of one validation issue of a model's chapter (ADR 0024 §3 prose rules, contract). */
function rejectionCause(issue: string): string {
  if (issue.includes('is no entry of this chapter')) return 'wrong citation';
  if (issue.includes('tells an account or a guess as fact')) return 'missing hedge';
  if (issue.includes('contains an ID')) return 'ID in prose';
  if (/^paragraphs\.\d+\.cites:/.test(issue)) return 'no citation';
  if (/^[A-Z_]+$/.test(issue)) return issue;
  return `schema: ${issue.slice(0, 60)}`;
}

/**
 * The Chronicle's semantic verdict for the MODEL (design §4): only prose the configured remote
 * model wrote is judged (citations, lexical hedges, coverage). Validation rejects wrong citations
 * and missing hedges before any commit and the template is committed instead, so a rejected model
 * answer is scored as a model failure with its causes; a template or local chapter is reported
 * apart and is never a model pass.
 */
export function chronicleModelVerdict(input: {
  readonly attempts: readonly {
    readonly provider: string;
    readonly kind: string;
    readonly outcome: string;
    readonly issues: readonly string[];
  }[];
  readonly proseProvider: string | null;
  readonly chapter:
    | (Pick<ChronicleChapterView, 'entries'> & {
        readonly prose: Pick<ChronicleChapterView['prose'], 'paragraphs'>;
      })
    | undefined;
  readonly language: Language;
}): ChronicleModelVerdict {
  const remote = input.attempts.filter((attempt) => attempt.provider !== 'local');
  const rejections = remote
    .filter((attempt) => attempt.outcome === 'invalid')
    .map((attempt) => ({
      kind: attempt.kind,
      causes: [...new Set(attempt.issues.map(rejectionCause))],
    }));
  const last = input.attempts.at(-1);
  const modelWrote =
    last !== undefined &&
    last.provider !== 'local' &&
    last.outcome === 'valid' &&
    input.proseProvider === last.provider;
  if (modelWrote && input.chapter !== undefined) {
    const verdict = chronicleVerdict(input.chapter, input.language);
    return {
      authorship: 'model',
      pass: verdict.citationsValid && verdict.hedgesPresent && verdict.entriesCovered,
      outcome: `model prose${rejections.length > 0 ? ' after a rejected answer' : ''}: citations ${verdict.citationsValid ? 'valid' : 'WRONG'}, hedges (lexical) ${verdict.hedgesPresent ? 'present' : 'MISSING'}, entries ${verdict.entriesCovered ? 'all told' : 'NOT all told'}`,
      reason: verdict.issues.join('; ') || null,
      rejections,
    };
  }
  if (rejections.length > 0) {
    const causes = [...new Set(rejections.flatMap((rejection) => rejection.causes))];
    return {
      authorship: 'model-rejected',
      pass: false,
      outcome: 'model prose rejected by validation; the template was committed',
      reason: `model output rejected: ${causes.join(', ')}`,
      rejections,
    };
  }
  const local = input.proseProvider === 'local';
  return {
    authorship: local ? 'local' : 'template',
    pass: null,
    outcome: local
      ? 'not model-authored: local prose (deterministic)'
      : 'not model-authored: template (no model output)',
    reason: null,
    rejections,
  };
}

export interface RelevanceVerdict {
  /** The same legal actions as the deterministic context: only relevance and order may differ. */
  readonly actionSetKept: boolean;
  /** A deterministic answer is exactly the Context Engine's, order and relevance included. */
  readonly fallbackExact: boolean;
  /** The status agrees with the source (`RANKED` only from the ranker; `TIMEOUT` deterministic). */
  readonly statusConsistent: boolean;
  /** End to end within the effective deadline plus the disclosed tolerance. */
  readonly withinDeadline: boolean;
  readonly issues: readonly string[];
}

/** JSON with object keys sorted at every depth, so field order never matters. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** An action as text, every field (nested included) but its relevance. */
const withoutRelevance = (action: ContextAction): string =>
  canonical(Object.fromEntries(Object.entries(action).filter(([key]) => key !== 'relevance')));

/**
 * The relevance contract (ADR 0021; design §2): the ranker may change only the relevance and the
 * order of the legal actions, every failure answers the deterministic actions unchanged, and the
 * caller never waits past its deadline (`deadlineMs`, read from configuration).
 */
export function relevanceVerdict(input: {
  readonly deterministic: readonly ContextAction[];
  readonly ranked: Pick<EntityContextResponse, 'ranking'> & {
    readonly context: { readonly actions: readonly ContextAction[] };
  };
  readonly elapsedMs: number;
  readonly deadlineMs: number;
  readonly toleranceMs: number;
}): RelevanceVerdict {
  const { deterministic, ranked } = input;
  const actions = ranked.context.actions;
  const issues: string[] = [];
  const canonical = (list: readonly ContextAction[]) => list.map(withoutRelevance).sort();
  const actionSetKept =
    JSON.stringify(canonical(actions)) === JSON.stringify(canonical(deterministic));
  if (!actionSetKept) issues.push('the action set differs from the deterministic context');
  const { source, status } = ranked.ranking;
  const fallbackExact =
    source === 'ai' || JSON.stringify(actions) === JSON.stringify(deterministic);
  if (!fallbackExact) issues.push('a deterministic answer differs from the Context Engine’s');
  const statusConsistent =
    source === 'ai'
      ? status === 'RANKED'
      : ['AI_UNAVAILABLE', 'INVALID_OUTPUT', 'TIMEOUT', 'NOTHING_TO_RANK'].includes(status);
  if (!statusConsistent) issues.push(`status ${status} from source ${source}`);
  const withinDeadline = input.elapsedMs <= input.deadlineMs + input.toleranceMs;
  if (!withinDeadline) issues.push('answered after the deadline');
  return { actionSetKept, fallbackExact, statusConsistent, withinDeadline, issues };
}
