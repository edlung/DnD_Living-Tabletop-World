import { createContext, useContext, useEffect, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import type { Resource } from '../api/resource.ts';

/**
 * The rules reference's reads (docs/adr/0055-rules-reference-and-toolbox.md §2–3). The SRD's text
 * never changes while a campaign is open, so each part is read once per connection and kept; a
 * failed read is forgotten, to be tried again. The connection comes from where a campaign's world
 * is shown; outside it (the table's TV) a term stays plain words.
 */
export const RulesApiContext = createContext<WorldApi | null>(null);
export const useRulesApi = (): WorldApi | null => useContext(RulesApiContext);

const kept = new WeakMap<WorldApi, Map<string, Promise<unknown>>>();

function read<T>(api: WorldApi, path: string): Promise<T> {
  let reads = kept.get(api);
  if (!reads) {
    reads = new Map();
    kept.set(api, reads);
  }
  const before = reads.get(path);
  if (before) return before as Promise<T>;
  // A read that waits longer than its connection allows ends; it is not kept.
  const reading = api.get<T>(path, new AbortController().signal, false).catch((error: unknown) => {
    reads.delete(path);
    throw error;
  });
  reads.set(path, reading);
  return reading;
}

export function useReference<T>(
  api: WorldApi | null,
  path: string | null,
): { readonly resource: Resource<T>; readonly retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [resource, setResource] = useState<Resource<T>>({ status: 'loading' });
  useEffect(() => {
    if (!api || path === null) return;
    let current = true;
    setResource({ status: 'loading' });
    read<T>(api, path).then(
      (value) => {
        if (current) setResource({ status: 'ready', value });
      },
      (error: unknown) => {
        if (current)
          setResource({
            status: 'error',
            message:
              error instanceof ApiError ? error.message : 'The rules could not be read. Try again.',
          });
      },
    );
    return () => {
      current = false;
    };
  }, [api, path, attempt]);
  return {
    resource,
    retry: () => {
      setAttempt((value) => value + 1);
    },
  };
}
