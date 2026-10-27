import type { MemoryRecallResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { formatWorldTime } from '../dm/world-time.ts';
import { Glyph } from '../visual/glyph.tsx';
import { latestFirst } from './memory-order.ts';

/** The recall projection's cap (`MAX_RECALL_LIMIT`). */
const JOURNAL_LIMIT = 50;

/**
 * Remembered events are the existing scoped projection, never raw world history, shown latest
 * first (`memory-order.ts`).
 */
export function RecentEvents({ api }: { readonly api: WorldApi }) {
  const t = useT();
  const load = useCallback(
    // As many as the projection gives (its cap), not its default ten most relevant: a timeline.
    (signal: AbortSignal) =>
      api.get<MemoryRecallResponse>('memories', signal, true, { limit: String(JOURNAL_LIMIT) }),
    [api],
  );
  const { resource, retry } = useResource('memories', load);
  return (
    <section className="recent-events sheet-section" aria-label={t('Remembered events')}>
      <h3>{t('Remembered events')}</h3>
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
          {latestFirst(resource.value.memories).map(({ memory }) => (
            <li key={memory.memoryId}>
              <span className="memory-meta">
                <Glyph name="memory" />
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
