import {
  campaignActivationAnswerSchema,
  campaignActivationConflictSchema,
  campaignActivationViewSchema,
  type CampaignActivationConflict,
  type CampaignActivationView,
  type StartCampaignActivation,
} from '@ltw/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useResource } from '../../api/resource.ts';
import type { WorkshopClient } from '../client.ts';
import { useRequestSignal } from '../use-request-signal.ts';
import { matchesActivationIntent } from './model.ts';

const acceptedSchema = campaignActivationAnswerSchema.extend({
  activation: campaignActivationViewSchema,
});

export function useActivationStatus(client: WorkshopClient, draftId: string) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await client.request(
        `/drafts/${draftId}/activation`,
        campaignActivationAnswerSchema,
        { signal },
      );
      if (
        result.kind !== 'ready' ||
        (result.value.activation && result.value.activation.draftId !== draftId)
      )
        throw new Error('WORKSHOP_READ_FAILED');
      return result.value.activation;
    },
    [client, draftId],
  );
  const state = useResource(`activation:${draftId}`, load);
  const provisioning =
    state.resource.status === 'ready' && state.resource.value?.status === 'PROVISIONING';
  const reread = state.reread;
  useEffect(() => {
    if (!provisioning) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') reread();
    };
    const timer = window.setInterval(refresh, 2000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [provisioning, reread]);
  return state;
}

/** A lost answer retries the exact confirmation; a changed review needs a new deliberate action. */
export function useActivationIntent(
  client: WorkshopClient,
  draftId: string,
  onAccepted: (activation: CampaignActivationView) => void,
) {
  const signal = useRequestSignal(),
    busy = useRef(false);
  const pending = useRef<StartCampaignActivation | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'uncertain' | 'conflict'>('idle');
  const [conflict, setConflict] = useState<CampaignActivationConflict | null>(null);
  const run = async (body: StartCampaignActivation) => {
    if (busy.current) return;
    if (pending.current && JSON.stringify(pending.current) !== JSON.stringify(body)) return;
    pending.current = body;
    busy.current = true;
    setState('busy');
    const current = signal();
    const result = await client.request(`/drafts/${draftId}/activation`, acceptedSchema, {
      body,
      signal: current,
      conflictSchema: campaignActivationConflictSchema,
    });
    busy.current = false;
    if (current.aborted || result.kind === 'cancelled' || result.kind === 'signed-out') return;
    if (
      result.kind === 'ready' &&
      matchesActivationIntent(result.value.activation, body, draftId)
    ) {
      pending.current = null;
      setState('idle');
      onAccepted(result.value.activation);
    } else if (result.kind === 'conflict') {
      setConflict(result.details ?? null);
      setState('conflict');
    } else setState('uncertain');
  };
  return {
    state,
    conflict,
    blocked: state === 'busy' || state === 'uncertain',
    run,
    retry: () => {
      if (pending.current) void run(pending.current);
    },
    reset: () => {
      if (busy.current) return;
      pending.current = null;
      setConflict(null);
      setState('idle');
    },
  };
}
