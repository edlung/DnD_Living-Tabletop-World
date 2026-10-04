import type {
  AuthoringIssue,
  AuthoringNote,
  AuthoringWarning,
  ResolutionOption,
} from '@ltw/contracts';

import type { ResolvedProposable } from '../../kernel/decision.ts';
import type { RecordedEvent } from '../../kernel/events.ts';
import type { WorldState } from '../../kernel/state.ts';
import { formatWorldTime } from '../../kernel/world-time.ts';

/**
 * Shared vocabulary of the continuity checks (docs/adr/0019-continuity-engine.md
 * §1): the input every check reads, how findings name things, and their keys.
 */
export interface ContinuityInput {
  /** The world before the proposal. */
  readonly before: WorldState;
  /** The provisional world after every operation that applied. */
  readonly state: WorldState;
  /** History followed by the provisional events. */
  readonly history: readonly RecordedEvent[];
  readonly commands: readonly ResolvedProposable[];
  /** Indexes of the operations that were decided successfully. */
  readonly applied: ReadonlySet<number>;
  /** Entities that are not secret: public ones, party members, and those the proposal created. */
  readonly open: ReadonlySet<string>;
}

/** Options are built by each check; their IDs are assigned from the finding's key. */
export type DraftOption = Omit<ResolutionOption, 'optionId'>;
export type IssueDraft = Omit<AuthoringIssue, 'options'> & {
  readonly options: readonly DraftOption[];
};
export type WarningDraft = Omit<AuthoringWarning, 'options'> & {
  readonly options: readonly DraftOption[];
};
export type NoteDraft = AuthoringNote;

export const when = (time: number | null) =>
  time === null ? 'before recorded history' : formatWorldTime(time);

export const nameOf = (state: WorldState, id: string) => state.entities.get(id)?.name ?? id;

export const normalized = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

/** `CODE@index` or `CODE@index:entityId` (ADR 0018 §3); `all` when no operation is concerned. */
export const findingKey = (code: string, index: number | null, entityId?: string) =>
  `${code}@${index === null ? 'all' : String(index)}${entityId === undefined ? '' : `:${entityId}`}`;

export const ACKNOWLEDGE: DraftOption = {
  kind: 'acknowledge',
  label: 'Accept it, and acknowledge it when confirming the commit',
  commands: null,
};

/** Gives each option its ID, `<finding key>/<n>`. */
export function withOptionIds<
  T extends { readonly key: string; readonly options: readonly DraftOption[] },
>(finding: T): Omit<T, 'options'> & { readonly options: readonly ResolutionOption[] } {
  return {
    ...finding,
    options: finding.options.map((option, position) => ({
      optionId: `${finding.key}/${String(position + 1)}`,
      ...option,
    })),
  };
}
