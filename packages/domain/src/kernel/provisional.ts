import type { KernelCommandType } from '@ltw/contracts';

import type { DecisionContext } from './decision.ts';
import { schemaVersionOf } from './event-versions.ts';
import type { KernelEvent, RecordedEvent } from './events.ts';
import { evolve } from './evolve.ts';
import type { WorldState } from './state.ts';

/**
 * The state after some of a decision's own draft events. A decision that
 * changes things in turn (a reaction, then the spell it let through, ADR
 * 0016) decides each step against the result of the previous ones. Pure:
 * placeholders stand in for the metadata the World Engine stamps later.
 */
export function foldDrafts(
  context: Pick<DecisionContext, 'state' | 'commandId' | 'actor'>,
  commandType: KernelCommandType,
  drafts: readonly KernelEvent[],
): WorldState {
  return foldDraftsWithEvents(context, commandType, drafts).state;
}

/** As `foldDrafts`, also returning the provisional events, for checks that read history. */
export function foldDraftsWithEvents(
  context: Pick<DecisionContext, 'state' | 'commandId' | 'actor'>,
  commandType: KernelCommandType,
  drafts: readonly KernelEvent[],
): { readonly state: WorldState; readonly events: readonly RecordedEvent[] } {
  let state = context.state;
  const events: RecordedEvent[] = [];
  for (const draft of drafts) {
    const provisional: RecordedEvent = {
      ...draft,
      campaignId: state.campaign?.campaignId ?? 'provisional',
      sequence: state.version + 1,
      eventId: '00000000-0000-4000-8000-000000000000',
      schemaVersion: schemaVersionOf(draft.type),
      worldTime: state.clock,
      recordedAt: '1970-01-01T00:00:00.000Z',
      causation: { commandId: context.commandId, commandType, actor: context.actor },
    };
    state = evolve(state, provisional);
    events.push({ ...provisional, worldTime: state.clock });
  }
  return { state, events };
}
