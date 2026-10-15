import type { CommandResult, NpcDialogueResponse, PlayerOutcome } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import type { CombatUiCommand } from '../combat/combat-bindings.ts';
import type { DmWorldCommand } from '../dm/world-controls.tsx';
import type { ExplorationCommand } from './action-bindings.ts';
import { outcomeMessage, rejectionMessage } from './outcome-messages.ts';

export type ExplorationIntent =
  | {
      readonly kind: 'command';
      readonly command: ExplorationCommand | CombatUiCommand | DmWorldCommand;
    }
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
  const t = useT();
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
    setState({
      status: 'busy',
      notice: {
        // A live NPC reply can take a while (ADR 0032, C): say what is being waited for.
        message:
          attempt.intent.kind === 'talk' ? t('Waiting for a reply…') : t('Resolving your action…'),
      },
    });
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
          ? { message: t('The conversation is not available now. Your view has been refreshed.') }
          : result.reply?.text
            ? { message: t('Spoken reply · not a fact'), speech: result.reply.text }
            : { message: t('No spoken reply is available. You can still ask about a subject.') };
      } else {
        const result = await api.post<CommandResult>(
          'commands',
          { commandId: attempt.commandId, command: attempt.intent.command },
          request.signal,
        );
        if (!['accepted', 'duplicate', 'rejected'].includes(result.status)) throw new ApiError(0);
        notice =
          result.status === 'rejected'
            ? { message: rejectionMessage(t, result.code, result.message) }
            : {
                message: outcomeMessage(t, result.outcome),
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
        setState({ status: 'done', notice: { message: t(error.message) } });
        onResolved();
      } else if (isLive())
        setState({
          status: 'uncertain',
          notice: {
            message: t(
              'The response was interrupted. The action may have completed. Retry this same action to check its result.',
            ),
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
