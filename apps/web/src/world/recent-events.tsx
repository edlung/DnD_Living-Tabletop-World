import type { MemoryRecallResponse } from '@ltw/contracts';
import { StatusPanel } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';

/** Remembered events are the existing scoped projection, never raw world history. */
export function RecentEvents({ api }: { readonly api: WorldApi }) {
  const load = useCallback(
    (signal: AbortSignal) => api.get<MemoryRecallResponse>('memories', signal),
    [api],
  );
  const { resource, retry } = useResource('memories', load);
  return (
    <section className="recent-events" aria-label="Remembered events">
      <h2>Remembered events</h2>
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={resource.status === 'error' ? resource.message : 'Loading remembered events…'}
          onRetry={retry}
        />
      ) : resource.value.memories.length === 0 ? (
        <p className="muted">No memories are available in this perspective yet.</p>
      ) : (
        <ul className="memory-list">
          {resource.value.memories.map(({ memory }) => (
            <li key={memory.memoryId}>
              <span className="eyebrow">
                {memory.memoryKind.replaceAll('_', ' ')} · {memory.occurredAt}
              </span>
              <p>{memory.summary}</p>
              <details>
                <summary>Event sources</summary>
                {memory.causedBy.length ? (
                  <ul>
                    {memory.causedBy.map((id) => (
                      <li key={id}>
                        <code>{id}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No event sources in this record.</p>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
