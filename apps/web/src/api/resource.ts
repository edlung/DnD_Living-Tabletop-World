import { useEffect, useState } from 'react';

import { ApiError } from './client.ts';

export type Resource<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error'; readonly message: string };

/**
 * A request owns one generation. Abort is an optimization; the live flag
 * rejects late success AND failure even when the transport ignores abort.
 * Key comparison hides old data during render, before effects run.
 */
export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const generation = `${key}:${attempt}`;
  const [stored, setStored] = useState<{ key: string; resource: Resource<T> } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    void load(controller.signal).then(
      (value) => {
        if (live) setStored({ key: generation, resource: { status: 'ready', value } });
      },
      (error: unknown) => {
        if (live)
          setStored({
            key: generation,
            resource: {
              status: 'error',
              message:
                error instanceof ApiError
                  ? error.message
                  : 'The world could not be loaded. Please try again.',
            },
          });
      },
    );
    return () => {
      live = false;
      controller.abort();
    };
  }, [generation, load]);
  return {
    resource: stored?.key === generation ? stored.resource : ({ status: 'loading' } as Resource<T>),
    retry: () => {
      setAttempt((current) => current + 1);
    },
  };
}
