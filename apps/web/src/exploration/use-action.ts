import type { CommandResult, NpcDialogueResponse, PlayerOutcome } from '@ltw/contracts';
import { useEffect, useRef, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import type { ExplorationCommand } from './action-bindings.ts';

export type ExplorationIntent =
  | { readonly kind: 'command'; readonly command: ExplorationCommand }
  | { readonly kind: 'talk'; readonly characterId: string; readonly npcId: string };

export interface ActionNotice {
  readonly message: string;
  readonly outcome?: PlayerOutcome;
  readonly speech?: string;
}
type Attempt = { readonly intent: ExplorationIntent; readonly commandId: string };

/** One mutation in flight. The same attempt survives an uncertain transport failure. */
export function useAction(
  api: WorldApi,
  canAct: boolean,
  onResolved: (outcome?: PlayerOutcome) => void,
) {
  const [state, setState] = useState<{
    status: 'idle' | 'busy' | 'uncertain' | 'done';
    notice: ActionNotice | null;
  }>({ status: 'idle', notice: null });
  const current = useRef<Attempt | null>(null);
  const busy = useRef(false);
  const live = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);

  const isLive = () => live.current;

  async function execute(attempt: Attempt) {
    if (!canAct || busy.current || !isLive()) return;
    busy.current = true;
    current.current = attempt;
    const request = new AbortController();
    controller.current = request;
    setState({ status: 'busy', notice: { message: 'Resolving your action…' } });
    try {
      let notice: ActionNotice;
      if (attempt.intent.kind === 'talk') {
        const intent = attempt.intent;
        const result = await api.post<NpcDialogueResponse>(
          `npcs/${encodeURIComponent(intent.npcId)}/dialogue`,
          { characterId: intent.characterId, intent: { kind: 'talk' } },
          request.signal,
        );
        notice = result.refused
          ? { message: 'The conversation is not available now. Your view has been refreshed.' }
          : result.reply?.text
            ? { message: 'Spoken reply · not a fact', speech: result.reply.text }
            : { message: 'No spoken reply is available. You can still ask about a subject.' };
      } else {
        const result = await api.post<CommandResult>(
          'commands',
          { commandId: attempt.commandId, command: attempt.intent.command },
          request.signal,
        );
        if (!['accepted', 'duplicate', 'rejected'].includes(result.status)) throw new ApiError(0);
        notice =
          result.status === 'rejected'
            ? { message: rejectionMessage(result.code) }
            : {
                message: outcomeMessage(result.outcome),
                ...(result.outcome ? { outcome: result.outcome } : {}),
              };
      }
      if (!isLive()) return;
      current.current = null;
      setState({ status: 'done', notice });
      onResolved(notice.outcome);
    } catch (error) {
      if (isLive() && error instanceof ApiError && error.status >= 400 && error.status < 500) {
        current.current = null;
        setState({ status: 'done', notice: { message: error.message } });
        onResolved();
      } else if (isLive())
        setState({
          status: 'uncertain',
          notice: {
            message:
              'The response was interrupted. The action may have completed. Retry this same action to check its result.',
          },
        });
    } finally {
      busy.current = false;
    }
  }

  return {
    ...state,
    locked: state.status === 'busy' || state.status === 'uncertain',
    run: (intent: ExplorationIntent) => {
      if (current.current || !canAct) return;
      void execute({ intent, commandId: `explore-${crypto.randomUUID()}` });
    },
    retry: () => {
      if (current.current) void execute(current.current);
    },
  };
}

function rejectionMessage(code: string): string {
  const messages: Readonly<Record<string, string>> = {
    ALREADY_ATTEMPTED: 'This check has already been attempted.',
    NOT_PRESENT: 'That subject is no longer within reach.',
    FORBIDDEN: 'You cannot perform this action from this session.',
    ENTITY_NOT_FOUND: 'That subject is no longer available in your view.',
    REACTION_PENDING: 'The world is waiting for a reaction to resolve.',
    ILLEGAL_ACTION: 'This action is not available in the current world.',
    NO_EFFECT: 'This action would make no change.',
  };
  return `${messages[code] ?? 'The world could not accept this action.'} Your view has been refreshed.`;
}

function outcomeMessage(outcome: PlayerOutcome | undefined): string {
  switch (outcome?.kind) {
    case 'EnterLocation':
      return 'You arrived. Your surroundings have been refreshed.';
    case 'AskAbout':
      return outcome.shared.length ? 'New testimony recorded.' : 'Nothing new was shared.';
    case 'ExamineEntity':
      return outcome.discovered.length ? 'Evidence discovered.' : 'No new evidence was discovered.';
    case 'ShowEvidence':
      return 'You showed the evidence. The conversation may have new leads.';
    case 'InsightCheck':
      return outcome.inferred.length
        ? 'An inference was recorded.'
        : 'No new inference was recorded.';
    case 'FormHypothesis':
      return 'Hypothesis recorded as HYPOTHESIS.';
    case 'CastSpell':
      return outcome.discovered.length
        ? 'Magic revealed new evidence.'
        : 'The spell resolved without new evidence.';
    default:
      return 'Action resolved. Your view has been refreshed.';
  }
}
