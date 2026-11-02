import type { CommandResult, DmHistoryEntry } from '@ltw/contracts';
import { useEffect, useRef, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';

export interface HistoryNotice {
  readonly kind: 'error' | 'success' | 'info';
  readonly text: string;
}

/** Fixed, spoiler-free words for the World Engine's refusals of an undo. */
const REFUSALS: Readonly<Record<string, string>> = {
  UNDO_UNSAFE: 'Other parts of the story now depend on this. Undo them first, newest first.',
  ALREADY_UNDONE: 'This was already undone.',
  FORBIDDEN: 'Only the DM can change the world this way.',
};

/** What an accepted undo of each kind of entry did. */
const UNDONE: Readonly<Record<DmHistoryEntry['kind'], string>> = {
  authoring: 'Undone. The world no longer holds this.',
  substitution: 'Undone. The world is as it was before this action.',
  world: 'Undone. The world is as it was before this change.',
  hand: 'Undone. The world is as it was before this change.',
};

/**
 * Undo from the DM history (docs/adr/0033-live-session.md §7) through the existing routes only:
 * an authoring commit through its proposal's undo, anything else as `UndoCommand`. The World
 * Engine decides each one; the list is re-read afterwards, so what it shows is the server's.
 * One undo at a time; nothing is kept beyond this component.
 */
export function useHistoryUndo(api: WorldApi, onChanged: (undone: DmHistoryEntry | null) => void) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<HistoryNotice | null>(null);
  const inFlight = useRef(false);
  const live = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);

  async function step(work: (signal: AbortSignal) => Promise<DmHistoryEntry | null>) {
    if (inFlight.current) return;
    inFlight.current = true;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setNotice(null);
    let undone: DmHistoryEntry | null = null;
    try {
      undone = await work(request.signal);
    } catch (error) {
      if (live.current) {
        setNotice({
          kind: 'error',
          text:
            error instanceof ApiError && error.status === 409
              ? 'This changed meanwhile. The history has been read again.'
              : error instanceof ApiError && error.status !== 0
                ? error.message
                : 'The response was interrupted. The history has been read again to show what really happened.',
        });
      }
    } finally {
      inFlight.current = false;
      if (live.current) {
        setBusy(false);
        onChanged(undone);
      }
    }
  }

  const undoCommand = (targetCommandId: string, signal: AbortSignal) =>
    api.post<CommandResult>(
      'commands',
      {
        commandId: `undo-${crypto.randomUUID()}`,
        command: { type: 'UndoCommand', targetCommandId },
      },
      signal,
    );

  return {
    busy,
    notice,
    undo: (entry: DmHistoryEntry) =>
      step(async (signal) => {
        const result =
          entry.kind === 'authoring'
            ? await api.post<CommandResult>(
                `authoring/proposals/${encodeURIComponent(entry.proposalId)}/undo`,
                {},
                signal,
              )
            : await undoCommand(entry.commandId, signal);
        if (!live.current) return null;
        if (result.status === 'rejected') {
          setNotice({
            kind: 'error',
            text: REFUSALS[result.code] ?? 'This cannot be undone now.',
          });
          return null;
        }
        setNotice({
          kind: 'success',
          text: UNDONE[entry.kind],
        });
        return entry;
      }),
    undoBlocker: (commandId: string) =>
      step(async (signal) => {
        const result = await undoCommand(commandId, signal);
        if (!live.current) return null;
        setNotice(
          result.status === 'rejected'
            ? { kind: 'error', text: 'That step cannot be undone yet. Undo newer ones first.' }
            : { kind: 'info', text: 'That step was undone. You can try the undo again.' },
        );
        return null;
      }),
  };
}
