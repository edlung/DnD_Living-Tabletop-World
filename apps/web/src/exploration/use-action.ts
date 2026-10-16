import type {
  CommandResult,
  NpcDialogueResponse,
  PlayerOutcome,
  RecordSubstitutionRequest,
  RecordSubstitutionResponse,
} from '@ltw/contracts';
import { useT, type Translate } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import type { CombatUiCommand } from '../combat/combat-bindings.ts';
import type { DmWorldCommand } from '../dm/world-controls.tsx';
import type { ExplorationCommand } from './action-bindings.ts';
import { outcomeMessage, rejectionMessage } from './outcome-messages.ts';

/**
 * The DM acting for a player's character (docs/adr/0033-live-session.md §6): the DM's reason,
 * recorded under the command's own client ID before the command is submitted.
 */
export type StandInReason = Omit<RecordSubstitutionRequest, 'clientCommandId'>;

export type ExplorationIntent =
  | {
      readonly kind: 'command';
      readonly command: ExplorationCommand | CombatUiCommand | DmWorldCommand;
      readonly standIn?: StandInReason;
    }
  | { readonly kind: 'talk'; readonly characterId: string; readonly npcId: string };

export interface ActionNotice {
  readonly message: string;
  readonly outcome?: PlayerOutcome;
  readonly speech?: string;
  /** Who spoke `speech`: the NPC the conversation is with. */
  readonly speakerId?: string;
  /** The NPC who would not talk now: no conversation with them stays open. */
  readonly talkRefusedBy?: string;
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
          ? {
              message: t('The conversation is not available now. Your view has been refreshed.'),
              talkRefusedBy: intent.npcId,
            }
          : result.reply?.text
            ? {
                message: t('Spoken reply · not a fact'),
                speech: result.reply.text,
                speakerId: intent.npcId,
              }
            : { message: t('No spoken reply is available. You can still ask about a subject.') };
      } else {
        const { command, standIn } = attempt.intent;
        // The reason first, under the same client command ID: a retry repeats both safely.
        if (standIn && !(await recordReason(api, attempt.commandId, standIn, request.signal))) {
          if (!isLive()) return;
          current.current = null;
          setState({ status: 'done', notice: { message: t(REASON_REFUSED) } });
          onResolved();
          return;
        }
        const result = await api.post<CommandResult>(
          'commands',
          { commandId: attempt.commandId, command },
          request.signal,
        );
        if (!['accepted', 'duplicate', 'rejected'].includes(result.status)) throw new ApiError(0);
        notice =
          result.status === 'rejected'
            ? { message: refusal(t, attempt.intent, result.code, result.message) }
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

const REASON_REFUSED = 'Your reason could not be recorded, so nothing was done for the player.';

/** Whether the DM's reason is recorded (now or already); a lost response throws to retry. */
async function recordReason(
  api: WorldApi,
  clientCommandId: string,
  reason: StandInReason,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const body: RecordSubstitutionRequest = { clientCommandId, ...reason };
    const answer = await api.post<RecordSubstitutionResponse>('dm/substitutions', body, signal);
    // Anything but these two answers is treated as a lost response: the same attempt retries.
    if (!['recorded', 'duplicate'].includes(answer.status)) throw new ApiError(0);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
    throw error;
  }
}

/** A refusal in words; skipping a player's turn says plainly why it waits (ADR 0016). */
function refusal(t: Translate, intent: ExplorationIntent, code: string, message: string): string {
  if (
    intent.kind === 'command' &&
    intent.standIn &&
    intent.command.type === 'EndTurn' &&
    code === 'REACTION_PENDING'
  ) {
    return t(
      'The turn cannot end while a reaction is pending. Close the reaction window first, or wait for the answer.',
    );
  }
  return rejectionMessage(t, code, message);
}
