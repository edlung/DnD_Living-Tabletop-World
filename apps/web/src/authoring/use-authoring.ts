import type {
  AuthoringProposalResponse,
  CommandRejected,
  DmIntentResponse,
  OpenProposalSummary,
  OpenProposalsResponse,
  ProposableCommand,
} from '@ltw/contracts';
import { useEffect, useRef, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';

export interface Notice {
  readonly kind: 'error' | 'info' | 'success';
  readonly text: string;
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
  COMMAND_ID_CONFLICT: 'This proposal was already decided differently. It was reloaded.',
  FORBIDDEN: 'Only the DM can change the world this way.',
};

/**
 * The DM's authoring session: words (or the DM's own edit of an NPC) → proposal → preview →
 * edit/confirm/cancel. Undo is the DM history's (`dm/dm-history.tsx`, ADR 0033 §7). Every step
 * is a call to an existing route; the client keeps no authority. Whatever the server says about
 * the proposal replaces what the screen holds, and a stale or refused submission never looks
 * committed. The screen's copy lives only in this component, so it disappears with the DM view;
 * the draft itself is the server's, so on mount in the DM perspective (a reload, or a switch
 * back to the DM) the newest open draft is read back (owner decisions 11, SI-D1). Nothing goes
 * into browser storage (ADR 0029 §8), and a cancel is the server's too, so a discarded draft
 * never returns.
 */
export function useAuthoring(api: WorldApi, enabled: boolean, onWorldChanged: () => void) {
  const [proposal, setShown] = useState<AuthoringProposalResponse | null>(null);
  // What the screen shows now, readable at once by a restore that finishes later.
  const shownNow = useRef<AuthoringProposalResponse | null>(null);
  const setProposal = (next: AuthoringProposalResponse | null) => {
    shownNow.current = next;
    setShown(next);
  };
  /** The DM's open drafts, newest first (the server's list, read again after each step). */
  const [drafts, setDrafts] = useState<readonly OpenProposalSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const inFlight = useRef(false);
  const live = useRef(true);
  const isLive = () => live.current;
  /** No step of the DM's runs: a restored draft never replaces what the DM just started. */
  const idle = () => !inFlight.current;
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);
  async function readDrafts(signal: AbortSignal): Promise<readonly OpenProposalSummary[]> {
    const open = await api.get<OpenProposalsResponse>('authoring/proposals', signal, false);
    if (isLive()) setDrafts(open.proposals);
    return open.proposals;
  }
  // The unfinished draft comes back, unless the DM has already started another.
  useEffect(() => {
    if (!enabled) return;
    const request = new AbortController();
    void (async () => {
      const [newest] = await readDrafts(request.signal);
      if (!newest || !isLive() || !idle()) return;
      const fresh = await api.get<unknown>(
        `authoring/proposals/${newest.proposalId}`,
        request.signal,
        false,
      );
      if (!isLive() || !idle() || !isProposal(fresh)) return;
      if (fresh.proposal.status !== 'DRAFT' || shownNow.current !== null) return;
      // Said only when the restored draft is the one shown.
      setProposal(fresh);
      setNotice({ kind: 'info', text: 'Your unfinished proposal was restored.' });
    })().catch(() => undefined);
    return () => {
      request.abort();
    };
  }, [api, enabled]);

  async function step(work: (signal: AbortSignal) => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setNotice(null);
    try {
      await work(request.signal);
      // Every step may open, change or close a draft: the list follows the server.
      if (enabled && isLive()) await readDrafts(request.signal).catch(() => undefined);
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
  async function refused(signal: AbortSignal, id: string, result: { readonly code?: string }) {
    const code = result.code ?? '';
    setNotice({
      kind: 'error',
      text: REFUSALS[code] ?? 'The world could not accept this. Nothing was added.',
    });
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

  function discard(id: string | null) {
    return step(async (signal) => {
      if (id === null) return;
      try {
        await api.post<unknown>(`authoring/proposals/${id}/cancel`, {}, signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          // Committed meanwhile: show what the server holds.
          setNotice({
            kind: 'error',
            text: 'This proposal was already decided differently. It was reloaded.',
          });
          await reload(signal, id);
          return;
        }
        throw error;
      }
      if (!isLive()) return;
      if (shownNow.current?.proposal.proposalId === id) setProposal(null);
      setNotice({ kind: 'info', text: 'Proposal discarded. Nothing was added to the world.' });
    });
  }

  return {
    proposal,
    drafts,
    busy,
    notice,
    propose: (text: string) =>
      step(async (signal) => {
        const intent = await api.post<DmIntentResponse>('ai/intents', { text }, signal);
        if (!isLive()) return;
        // Authoring needs a persisted PROPOSED trace: a null trace ID (no durable request start,
        // ADR 0032 B2) is never sent as a source.
        const traceId = intent.traceId;
        if (intent.status !== 'PROPOSED' || !intent.proposal || traceId === null) {
          // Honest feedback (ADR 0032, C): an unavailable assistant (including no recorded
          // request) is not a request the assistant declined; neither promises a trace.
          setNotice({
            kind: 'error',
            text:
              intent.status === 'AI_UNAVAILABLE' || traceId === null
                ? 'The assistant is unavailable right now, so nothing was proposed. Try again later.'
                : 'The assistant could not turn that into a proposal. Try describing it differently.',
          });
          return;
        }
        const created = await api.post<unknown>('authoring/proposals', { traceId }, signal);
        if (!isLive()) return;
        if (isProposal(created)) setProposal(created);
        else setNotice({ kind: 'error', text: 'The proposal could not be stored.' });
      }),
    /** The DM's own proposal (an edit of an NPC's card): the same preview, confirm and undo. */
    proposeWritten: async (summary: string, commands: readonly ProposableCommand[]) => {
      let stored = false;
      await step(async (signal) => {
        const created = await api.post<unknown>(
          'authoring/proposals',
          { summary, commands },
          signal,
        );
        if (!isLive()) return;
        if (isProposal(created)) {
          setProposal(created);
          stored = true;
        } else setNotice({ kind: 'error', text: 'The proposal could not be stored.' });
      });
      return stored;
    },
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
    reload: () =>
      step(async (signal) => {
        if (proposal) await reload(signal, proposal.proposal.proposalId);
      }),
    cancel: () => discard(proposal?.proposal.proposalId ?? null),
    /** Discards one open draft, shown or listed. */
    discard: (proposalId: string) => discard(proposalId),
    /** Shows another open draft from the list; the one shown stays open. */
    resume: (proposalId: string) =>
      step(async (signal) => {
        const fresh = await api.get<unknown>(`authoring/proposals/${proposalId}`, signal, false);
        if (isLive() && isProposal(fresh)) setProposal(fresh);
      }),
    clear: () => {
      setProposal(null);
      setNotice(null);
    },
  };
}
