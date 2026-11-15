import type {
  CommandResult,
  GenerateChronicleResponse,
  MembershipResponse,
  MemorySuggestionView,
} from '@ltw/contracts';

import { ApiError, type WorldApi } from '../api/client.ts';
import { ALL_TIME, chapterTitle } from '../chronicle/book-chapters.ts';

/**
 * Closing an evening (docs/adr/0071-memory-and-ritual.md §1.3): the moments the DM keeps, each a
 * `RecordMemory` the World Engine decides, sent while the session is open so each memory carries
 * its session; then the session's end, the table's screens and guest seats as before; then the
 * party's chapter of this session. A step that fails leaves the earlier ones standing and is
 * named; nothing is retried silently. Command IDs are the caller's, so pressing again repeats
 * nothing that was done.
 */
export interface EveningPlan {
  readonly sessionId: string;
  readonly title: string;
  /** The suggestions the DM kept. */
  readonly kept: readonly MemorySuggestionView[];
  /** The DM's own line; empty for none. */
  readonly line: string;
  /** The world time the DM's line happened at. */
  readonly now: number;
  /** Why the DM's line was recorded, in the DM's history. */
  readonly reason: string;
  readonly chapter: boolean;
  readonly unpair: boolean;
  readonly guests: boolean;
  /** A stable ID for each command of this closing. */
  readonly commandId: (key: string) => string;
}

export type EveningChapter =
  | { readonly kind: 'skipped' }
  | { readonly kind: 'written'; readonly chronicleId: string | null; readonly prose: string }
  /** The party remembers nothing of this evening: there is nothing to tell. */
  | { readonly kind: 'nothing' }
  | { readonly kind: 'failed' };

/** The steps of a closing, as the sheet names them while they run. */
export type EveningStep = 'moments' | 'end' | 'chapter';

export interface EveningResult {
  /** The session that was closed: its chapter may be asked for again. */
  readonly sessionId: string;
  readonly title: string;
  /** The step that stopped the closing; null when the evening is closed. */
  readonly stopped: 'moments' | 'end' | null;
  readonly kept: number;
  /** The moments the World Engine refused, by their words. */
  readonly refused: readonly string[];
  readonly unpaired: boolean;
  /** Guest seats freed; null when not asked. */
  readonly freed: number | null;
  readonly chapter: EveningChapter;
}

/**
 * A suggested moment's kind, said above its words where the words do not say it themselves (an
 * arrival's and a new day's sentences do).
 */
export const KICKERS: Readonly<Partial<Record<MemorySuggestionView['reason'], string>>> = {
  battle: 'A fight',
  contradiction: 'Accounts disagree',
};

/** What the sheet says while a closing's step runs. */
export const STEP_WORDS: Readonly<Record<EveningStep, string>> = {
  moments: 'Keeping the moments…',
  end: 'Ending the session…',
  chapter: 'Writing the chapter… A narrator can take a minute or two.',
};

const wait = () => AbortSignal.timeout(30_000);

/** A suggested moment in its own words: the summary of its `RecordMemory` draft. */
export function momentWords(suggestion: MemorySuggestionView): string {
  const summary = suggestion.command['summary'];
  return typeof summary === 'string' ? summary : '';
}

/** Whether the World Engine took the command; a lost answer throws. */
async function send(api: WorldApi, commandId: string, command: object): Promise<boolean> {
  const result = await api.post<CommandResult>('commands', { commandId, command }, wait());
  if (!['accepted', 'duplicate', 'rejected'].includes(result.status)) throw new ApiError(0);
  return result.status !== 'rejected';
}

/** The sentence for the prose a written chapter holds (ADR 0032, C), as `chapterMessage` words it. */
export type ProseWords = (response: GenerateChronicleResponse) => string;

export async function closeEvening(
  api: WorldApi,
  plan: EveningPlan,
  proseWords: ProseWords,
  /** Told as each step begins: a narrator's chapter can take a minute or two. */
  onStep: (step: EveningStep) => void = () => undefined,
): Promise<EveningResult> {
  let kept = 0;
  const refused: string[] = [];
  const stop = (stopped: 'moments' | 'end'): EveningResult => ({
    sessionId: plan.sessionId,
    title: plan.title,
    stopped,
    kept,
    refused,
    unpaired: false,
    freed: null,
    chapter: { kind: 'skipped' },
  });

  const moments: { readonly key: string; readonly words: string; readonly command: object }[] =
    plan.kept.map((suggestion) => ({
      key: suggestion.suggestionId,
      words: momentWords(suggestion),
      command: { ...suggestion.command, sessionId: plan.sessionId },
    }));
  const line = plan.line.trim();
  if (line !== '') {
    moments.push({
      key: 'line',
      words: line,
      command: {
        type: 'RecordMemory',
        scope: { kind: 'PARTY' },
        memoryKind: 'CONSEQUENCE',
        summary: line,
        occurredAt: plan.now,
        sessionId: plan.sessionId,
        // What the DM says mattered is the evening's most salient moment: the recap tells it.
        salience: 5,
        reason: plan.reason,
      },
    });
  }
  onStep('moments');
  try {
    for (const moment of moments) {
      if (await send(api, plan.commandId(moment.key), moment.command)) kept += 1;
      else refused.push(moment.words);
    }
  } catch {
    return stop('moments');
  }

  onStep('end');
  try {
    // A paused table would hold nothing of the DM's, but the next session must not start paused.
    await api.post('lobby', { paused: false }, wait(), true);
    const ended = await send(api, plan.commandId('end'), {
      type: 'EndSession',
      sessionId: plan.sessionId,
    });
    if (!ended) return stop('end');
  } catch {
    return stop('end');
  }

  let unpaired = false;
  if (plan.unpair) {
    unpaired = await api.post('displays/revoke', {}, wait()).then(
      () => true,
      () => false,
    );
  }
  let freed: number | null = null;
  if (plan.guests) {
    const members = await api
      .get<MembershipResponse>('invitations', wait(), false)
      .catch(() => null);
    const free = members?.members.filter((member) => member.login === null) ?? [];
    for (const member of free) {
      await api
        .post(`members/${encodeURIComponent(member.characterId)}/revoke`, {}, wait())
        .catch(() => undefined);
    }
    freed = free.length;
  }

  if (plan.chapter) onStep('chapter');
  return {
    sessionId: plan.sessionId,
    title: plan.title,
    stopped: null,
    kept,
    refused,
    unpaired,
    freed,
    chapter: plan.chapter ? await writeChapter(api, plan, proseWords) : { kind: 'skipped' },
  };
}

/** The party's chapter of one session; also asked for again when the first try failed. */
export async function writeChapter(
  api: WorldApi,
  plan: { readonly sessionId: string; readonly title: string },
  proseWords: ProseWords,
): Promise<EveningChapter> {
  try {
    const written = await api.post<GenerateChronicleResponse>(
      'chronicle',
      {
        title: chapterTitle(plan.title),
        perspective: 'PARTY',
        // The session cuts the chapter, not a window (ADR 0071 §1.2).
        from: ALL_TIME,
        sessionId: plan.sessionId,
      },
      // A narrator may take a while (ADR 0032, C).
      AbortSignal.timeout(120_000),
    );
    if (written.result.status === 'rejected') return { kind: 'failed' };
    return { kind: 'written', chronicleId: written.chronicleId, prose: proseWords(written) };
  } catch (error) {
    return error instanceof ApiError && error.status === 422
      ? { kind: 'nothing' }
      : { kind: 'failed' };
  }
}
