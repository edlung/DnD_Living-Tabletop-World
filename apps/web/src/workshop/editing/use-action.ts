import { useEffect, useRef, useState } from 'react';
import { campaignRevisionConflictSchema, type CampaignRevisionConflictView } from '@ltw/contracts';
import type { z } from 'zod';

import type { WorkshopClient, WorkshopResult } from '../client.ts';
import { useRequestSignal } from '../use-request-signal.ts';

/** One pending intention. Its path, schema, CAS and nonce survive uncertain answers unchanged. */
export function useEditAction(client: WorkshopClient, onReady: () => void = () => {}) {
  const [state, setState] = useState<
    'idle' | 'busy' | 'done' | 'uncertain' | 'conflict' | 'unavailable' | 'waiting'
  >('idle');
  const [conflict, setConflict] = useState<unknown>(null);
  const pending = useRef<{ path: string; body: object; schema: z.ZodType } | null>(null);
  const busy = useRef(false),
    alive = useRef(true),
    signal = useRequestSignal();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = async <T>(
    path: string,
    body: object,
    schema: z.ZodType<T>,
  ): Promise<WorkshopResult<T, CampaignRevisionConflictView>> => {
    if (busy.current) return { kind: 'cancelled' };
    const original = pending.current;
    if (
      original &&
      (original.path !== path || JSON.stringify(original.body) !== JSON.stringify(body))
    )
      return { kind: 'failed' };
    pending.current = { path, body, schema };
    busy.current = true;
    setState('busy');
    setConflict(null);
    const result = await client.request(path, schema, {
      body,
      signal: signal(),
      conflictSchema: campaignRevisionConflictSchema,
    });
    busy.current = false;
    if (!alive.current) return { kind: 'cancelled' };
    if (result.kind === 'ready') {
      pending.current = null;
      setState('done');
      onReady();
    } else if (result.kind === 'conflict') {
      setState('conflict');
      setConflict(result.details ?? null);
    } else if (result.kind === 'unavailable') {
      pending.current = null;
      setState('unavailable');
    } else if (result.kind === 'busy') {
      pending.current = null;
      setState('waiting');
    } else if (result.kind !== 'cancelled' && result.kind !== 'signed-out') setState('uncertain');
    return result;
  };
  return {
    state,
    conflict,
    blocked: ['busy', 'uncertain', 'conflict'].includes(state),
    run,
    retry: async () => {
      const value = pending.current;
      return value ? run(value.path, value.body, value.schema) : ({ kind: 'cancelled' } as const);
    },
    reset: () => {
      if (busy.current) return;
      pending.current = null;
      setState('idle');
      setConflict(null);
    },
  };
}
