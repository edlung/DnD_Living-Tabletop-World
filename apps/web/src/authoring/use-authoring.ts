import type {
  AuthoringProposalResponse,
  CommandRejected,
  DmIntentResponse,
  ProposableCommand,
} from '@ltw/contracts';
import { useEffect, useRef, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';

export interface Notice {
  readonly kind: 'error' | 'info' | 'success';
  readonly text: string;
}
export interface Blocker {
  readonly commandId: string;
  readonly commandType: string;
}

const isProposal = (value: unknown): value is AuthoringProposalResponse =>
  typeof value === 'object' && value !== null && 'proposal' in value;

/** Fixed, spoiler-free explanations of the World Engine's refusals. */
const REFUSALS: Readonly<Record<string, string>> = {
  CONFIRMATION_REQUIRED:
    'The proposal now needs more confirmation than you gave. It was reloaded; review it again.',
  AUTHORING_INVALID: 'The world no longer allows this proposal. Nothing was added.',
  AUTHORING_UNSUPPORTED:
    'This kind of change cannot be added through authoring. Nothing was added.',
  UNDO_UNSAFE: 'Other parts of the story now depend on this. Undo them first, newest first.',
  COMMAND_ID_CONFLICT: 'This proposal was already decided differently. It was reloaded.',
  FORBIDDEN: 'Only the DM can change the world this way.',
};

/**
 * The DM's authoring session: words → proposal → preview → edit/confirm/cancel
 * → undo. Every step is a call to an existing route; the client keeps no
 * authority. Whatever the server says about the proposal replaces what the
 * screen holds, and a stale or refused submission never looks committed.
 * State lives only in this component, so it disappears with the DM view.
 */
export function useAuthoring(api: WorldApi, onWorldChanged: () => void) {
  const [proposal, setProposal] = useState<AuthoringProposalResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [blockers, setBlockers] = useState<readonly Blocker[]>([]);
  const inFlight = useRef(false);
  const live = useRef(true);
  const isLive = () => live.current;
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);

  async function step(work: (signal: AbortSignal) => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setNotice(null);
    try {
      await work(request.signal);
    } catch (error) {
      if (isLive()) {
        setNotice({
          kind: 'error',
          text:
            error instanceof ApiError && error.status !== 0
              ? error.message
              : 'The response was interrupted. Reload the proposal to see what really happened.',
        });
      }
    } finally {
      inFlight.current = false;
      if (isLive()) setBusy(false);
    }
  }

  async function reload(signal: AbortSignal, id: string) {
    const fresh = await api.get<unknown>(`authoring/proposals/${id}`, signal, false);
    if (isLive() && isProposal(fresh)) setProposal(fresh);
  }

  /** A submission the server refused: say why, and show its real latest state. */
  async function refused(
    signal: AbortSignal,
    id: string,
    result: Pick<CommandRejected, 'details'> & { readonly code?: string },
  ) {
    const code = result.code ?? '';
    setNotice({
      kind: 'error',
      text: REFUSALS[code] ?? 'The world could not accept this. Nothing was added.',
    });
    const listed = result.details?.['blockers'];
    if (Array.isArray(listed)) setBlockers(listed as readonly Blocker[]);
    await reload(signal, id);
  }

  async function submitRevision(
    signal: AbortSignal,
    id: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    try {
      const result = await api.post<unknown>(`authoring/proposals/${id}/revisions`, body, signal);
      if (!isLive()) return;
      if (isProposal(result)) {
        setProposal(result);
        setNotice({ kind: 'info', text: 'Updated. The preview and confirmation were recomputed.' });
      } else {
        await refused(signal, id, result as CommandRejected);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setNotice({
          kind: 'error',
          text: 'This proposal changed since you opened it. The latest revision was reloaded; review it again.',
        });
        await reload(signal, id);
        return;
      }
      throw error;
    }
  }

  return {
    proposal,
    busy,
    notice,
    blockers,
    propose: (text: string) =>
      step(async (signal) => {
        setBlockers([]);
        const intent = await api.post<DmIntentResponse>('ai/intents', { text }, signal);
        if (!isLive()) return;
        // Authoring needs a persisted PROPOSED trace: a null trace ID (no durable request start,
        // ADR 0032 B2) is never sent as a source.
        const traceId = intent.traceId;
        if (intent.status !== 'PROPOSED' || !intent.proposal || traceId === null) {
          setNotice({
            kind: 'error',
            text: 'The assistant could not turn that into a proposal. Try describing it differently.',
          });
          return;
        }
        const created = await api.post<unknown>('authoring/proposals', { traceId }, signal);
        if (!isLive()) return;
        if (isProposal(created)) setProposal(created);
        else setNotice({ kind: 'error', text: 'The proposal could not be stored.' });
      }),
    revise: (commands: readonly ProposableCommand[]) =>
      step(async (signal) => {
        if (!proposal) return;
        await submitRevision(signal, proposal.proposal.proposalId, {
          basedOnRevision: proposal.proposal.revision,
          commands,
        });
      }),
    applyOption: (optionId: string) =>
      step(async (signal) => {
        if (!proposal) return;
        await submitRevision(signal, proposal.proposal.proposalId, {
          basedOnRevision: proposal.proposal.revision,
          optionId,
        });
      }),
    commit: (acknowledgedWarnings: readonly string[]) =>
      step(async (signal) => {
        const current = proposal;
        const required = current?.preview?.confirmation;
        if (!current || !required) return;
        const id = current.proposal.proposalId;
        try {
          const result = await api.post<{ status: string; code?: string }>(
            `authoring/proposals/${id}/commit`,
            {
              revision: current.proposal.revision,
              confirmation: { riskLevel: required.riskLevel, acknowledgedWarnings },
            },
            signal,
          );
          if (!isLive()) return;
          if (result.status === 'accepted' || result.status === 'duplicate') {
            await reload(signal, id);
            setNotice({ kind: 'success', text: 'Added to the world.' });
            onWorldChanged();
          } else {
            await refused(signal, id, result);
          }
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) {
            setNotice({
              kind: 'error',
              text: 'This proposal changed since you opened it. The latest revision was reloaded; review it again.',
            });
            await reload(signal, id);
            return;
          }
          // The commit may have landed: show the truth, never a guess.
          await reload(signal, id).catch(() => undefined);
          throw error;
        }
      }),
    undo: () =>
      step(async (signal) => {
        if (!proposal) return;
        const id = proposal.proposal.proposalId;
        setBlockers([]);
        const result = await api.post<{ status: string; code?: string }>(
          `authoring/proposals/${id}/undo`,
          {},
          signal,
        );
        if (!isLive()) return;
        if (result.status === 'accepted' || result.status === 'duplicate') {
          await reload(signal, id);
          setNotice({ kind: 'success', text: 'Undone. The world no longer holds this.' });
          onWorldChanged();
        } else {
          await refused(signal, id, result);
        }
      }),
    undoBlocker: (commandId: string) =>
      step(async (signal) => {
        const result = await api.post<{ status: string; code?: string }>(
          'commands',
          {
            commandId: `undo-${crypto.randomUUID()}`,
            command: { type: 'UndoCommand', targetCommandId: commandId },
          },
          signal,
        );
        if (!isLive()) return;
        if (result.status === 'accepted') {
          setBlockers((current) => current.filter((entry) => entry.commandId !== commandId));
          setNotice({ kind: 'info', text: 'That step was undone. You can try the undo again.' });
          onWorldChanged();
        } else {
          setNotice({
            kind: 'error',
            text: 'That step cannot be undone yet. Undo newer ones first.',
          });
        }
      }),
    reload: () =>
      step(async (signal) => {
        if (proposal) await reload(signal, proposal.proposal.proposalId);
      }),
    cancel: () => {
      setProposal(null);
      setBlockers([]);
      setNotice({ kind: 'info', text: 'Proposal discarded. Nothing was added to the world.' });
    },
    clear: () => {
      setProposal(null);
      setBlockers([]);
      setNotice(null);
    },
  };
}
