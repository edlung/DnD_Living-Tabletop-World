import type { MemoryRecallResponse } from '@ltw/contracts';
import { StatusPanel } from '@ltw/ui';
import { useCallback, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';

/** The selected object constrains the recall; neither scope nor NPC is broadened. */
export function Recall({ api, entityId }: { readonly api: WorldApi; readonly entityId: string }) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<MemoryRecallResponse>('memories', signal, true, {
        entity: entityId,
        limit: '50',
        ...(query ? { q: query } : {}),
      }),
    [api, entityId, query],
  );
  const { resource, retry } = useResource(`${entityId}:${query}`, load);
  return (
    <section className="context-recall" aria-label="Recalled memories">
      <h3>Recalled memories</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(text.trim());
        }}
      >
        <label htmlFor="recall-query">Search these memories</label>
        <input
          id="recall-query"
          value={text}
          maxLength={500}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <button type="submit">Search memories</button>
      </form>
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={resource.status === 'error' ? resource.message : 'Recalling this subject…'}
          onRetry={retry}
        />
      ) : (
        <>
          <p className="muted">
            {resource.value.total} matching memories
            {resource.value.total > 50
              ? ' · showing the first 50; narrow your search for more'
              : ''}
          </p>
          {resource.value.memories.length === 0 ? (
            <p>No memories about this subject are available in this perspective.</p>
          ) : (
            <ul className="memory-list">
              {resource.value.memories.map(({ memory }) => (
                <li key={memory.memoryId}>
                  <span className="badge">{memory.memoryKind}</span>
                  <p>{memory.summary}</p>
                  <small>World time {memory.occurredAt}</small>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
