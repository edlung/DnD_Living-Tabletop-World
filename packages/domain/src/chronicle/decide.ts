import { parsePerspective } from '@ltw/contracts';

import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import {
  accept,
  reject,
  type Decision,
  type DecisionContext,
  type ResolvedCommandOf,
} from '../kernel/decision.ts';
import type { RecordedEvent, Restore } from '../kernel/events.ts';
import { facts, type FactKey } from '../kernel/fact-keys.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';
import { resolvePerspective } from '../knowledge/perspective.ts';
import { languageOf } from '../language/index.ts';
import { chronicleEntries } from './entries.ts';
import { checkProse } from './prose.ts';

/**
 * `GenerateChronicle` (docs/adr/0024-chronicle.md §4; owner decision of
 * 2026-10-04): the DM records a chapter told from a perspective over a
 * world-time window. The World Engine computes the entries itself and only
 * checks that the prose, written outside it, cites them and follows the
 * prose rules; it never reads the prose. A chapter rests on everything it
 * tells: undoing any of it is refused while the chapter stands.
 */
const invalid = (message: string, details?: Record<string, unknown>) =>
  reject('INVALID_CHRONICLE', message, details);

export function decideGenerateChronicle(
  context: DecisionContext,
  command: ResolvedCommandOf<'GenerateChronicle'>,
): Decision {
  const { state, history, actor } = context;
  if (command.from > command.to || command.to > state.clock) {
    return invalid('The window must end no later than the world clock, and after it starts');
  }
  const request = parsePerspective(command.perspective);
  const access = request ? resolvePerspective(state, actor, request) : null;
  if (!access?.ok) return invalid('No perspective the chapter can be told from');
  const draft = chronicleEntries(state, history, access.perspective, command.from, command.to);
  if (draft.entries.length === 0) return invalid('Nothing to tell from that perspective then');
  const issues = checkProse(draft.entries, command.prose.paragraphs, languageOf(state));
  if (issues.length > 0) return invalid('The prose does not follow the chapter', { issues });
  return accept({
    type: 'ChronicleGenerated',
    payload: {
      chronicleId: context.commandId,
      title: command.title,
      perspective: access.perspective.label,
      from: command.from,
      to: command.to,
      entries: draft.entries,
      prose: structuredClone(command.prose),
      rests: draft.rests,
    },
  });
}

export function applyChronicleGenerated(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'ChronicleGenerated' }>,
): WorldState {
  const { chronicleId } = event.payload;
  if (state.chronicles.has(chronicleId)) {
    throw new CorruptHistoryError(`chronicle ${chronicleId} already exists`);
  }
  return {
    ...state,
    chronicles: withEntry(state.chronicles, chronicleId, {
      ...event.payload,
      generatedAt: event.worldTime,
    }),
  };
}

export function applyChronicleRestore(
  state: WorldState,
  restore: Extract<Restore, { fact: 'chronicle' }>,
): WorldState {
  return { ...state, chronicles: withoutEntry(state.chronicles, restore.chronicleId) };
}

export function chronicleFootprint(
  payload: Extract<RecordedEvent, { type: 'ChronicleGenerated' }>['payload'],
): {
  reads: FactKey[];
  writes: FactKey[];
} {
  return {
    reads: [facts.clock(), ...payload.rests],
    writes: [facts.chronicle(payload.chronicleId)],
  };
}
