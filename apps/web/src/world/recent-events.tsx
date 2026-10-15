import type { MemoryRecallResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { formatWorldTime } from '../dm/world-time.ts';

/** Remembered events are the existing scoped projection, never raw world history. */
export function RecentEvents({ api }: { readonly api: WorldApi }) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<MemoryRecallResponse>('memories', signal),
    [api],
  );
  const { resource, retry } = useResource('memories', load);
  return (
    <section className="recent-events" aria-label={t('Remembered events')}>
      <h2>{t('Remembered events')}</h2>
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={resource.status === 'error' ? resource.message : t('Loading remembered events…')}
          onRetry={retry}
        />
      ) : resource.value.memories.length === 0 ? (
        <p className="muted">{t('No memories are available in this perspective yet.')}</p>
      ) : (
        <ul className="memory-list">
          {resource.value.memories.map(({ memory }) => (
            <li key={memory.memoryId}>
              <span className="eyebrow">
                {t(memory.memoryKind.replaceAll('_', ' ').toLowerCase())} ·{' '}
                {formatWorldTime(memory.occurredAt, t)}
              </span>
              <p>{memory.summary}</p>
              <details>
                <summary>{t('Event sources')}</summary>
                {memory.causedBy.length ? (
                  <ul>
                    {memory.causedBy.map((id) => (
                      <li key={id}>
                        <code>{id}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t('No event sources in this record.')}</p>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
