import { useCallback, useEffect } from 'react';

import { useResource } from '../../api/resource.ts';
import type { WorkshopClient } from '../client.ts';
import { availabilitySchema, jobsSchema, progressSchema } from '../response-schemas.ts';

export function useGeneration(client: WorkshopClient, draftId: string, jobId: string | null) {
  const path = `/drafts/${draftId}/generation`;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [availability, jobs] = await Promise.all([
        client.request(`${path}/availability`, availabilitySchema, { signal }),
        client.request(path, jobsSchema, { signal }),
      ]);
      if (availability.kind !== 'ready' || jobs.kind !== 'ready')
        throw new Error('WORKSHOP_READ_FAILED');
      return { availability: availability.value, ...jobs.value };
    },
    [client, path],
  );
  const history = useResource(`generation:${draftId}`, load);
  const loadJob = useCallback(
    async (signal: AbortSignal) => {
      if (!jobId) return null;
      const result = await client.request(`${path}/${jobId}/progress`, progressSchema, { signal });
      if (result.kind !== 'ready') throw new Error('WORKSHOP_READ_FAILED');
      return result.value;
    },
    [client, path, jobId],
  );
  const progress = useResource(`progress:${draftId}:${String(jobId)}`, loadJob);
  const status = progress.resource.status === 'ready' ? progress.resource.value?.job.status : null;
  const reread = progress.reread;
  useEffect(() => {
    if (status !== 'QUEUED' && status !== 'RUNNING') return;
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
  }, [status, reread]);
  return { history, progress };
}
