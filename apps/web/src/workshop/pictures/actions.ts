import { useEffect, useRef, useState } from 'react';
import type { z } from 'zod';

import type { WorkshopClient } from '../client.ts';
import { useRequestSignal } from '../use-request-signal.ts';

export function usePictureActions(client: WorkshopClient, onChanged: () => void) {
  const signal = useRequestSignal();
  const [state, setState] = useState<'idle' | 'busy' | 'uncertain' | 'conflict' | 'done'>('idle');
  const alive = useRef(true);
  const pending = useRef<{ path: string; body: object; schema: z.ZodType } | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const send = async (path: string, body: object, schema: z.ZodType) => {
    if (state === 'busy') return;
    const original = pending.current ?? { path, body, schema };
    pending.current = original;
    setState('busy');
    const result = await client.request(original.path, original.schema, {
      body: original.body,
      signal: signal(),
    });
    if (!alive.current) return;
    if (result.kind === 'ready') {
      pending.current = null;
      setState('done');
      onChanged();
    } else if (result.kind === 'conflict') {
      setState('conflict');
      onChanged();
    } else if (result.kind !== 'cancelled' && result.kind !== 'signed-out') setState('uncertain');
  };
  return {
    state,
    busy: ['busy', 'uncertain', 'conflict'].includes(state),
    send,
    retry: () => {
      const value = pending.current;
      if (value) void send(value.path, value.body, value.schema);
    },
    reset: () => {
      pending.current = null;
      setState('idle');
      onChanged();
    },
  };
}
