import type { PlayerAssetView } from '@ltw/contracts';
import { createContext, useContext, useEffect, useState } from 'react';

import type { WorldApi } from '../api/client.ts';

/**
 * Approved world images (ADR 0022, ADR 0026 §6): fetched with the viewer's authorization and
 * shown through object URLs, revoked when the world screen goes away (a perspective change, a
 * refresh, leaving). Held per world screen, so the re-render after an action neither fetches
 * again nor flashes the neutral fallback. A failed fetch leaves the neutral fallback; nothing is
 * ever invented in an image's place.
 */
export class ApprovedImages {
  readonly #api: WorldApi;
  readonly #urls = new Map<string, string>();
  readonly #pending = new Map<string, Promise<string | null>>();
  #controller = new AbortController();

  constructor(api: WorldApi) {
    this.#api = api;
  }

  /** The URL of an image already fetched. */
  peek(hash: string): string | null {
    return this.#urls.get(hash) ?? null;
  }

  /** The URL of an image, fetched once; null when it cannot be fetched. */
  load(hash: string): Promise<string | null> {
    const known = this.#urls.get(hash);
    if (known) return Promise.resolve(known);
    const pending = this.#pending.get(hash);
    if (pending) return pending;
    const controller = this.#controller;
    const request = this.#api
      .image(hash, controller.signal)
      .then(
        (blob) => {
          if (controller.signal.aborted) return null;
          const url = URL.createObjectURL(blob);
          this.#urls.set(hash, url);
          return url;
        },
        () => null,
      )
      .finally(() => {
        if (this.#pending.get(hash) === request) this.#pending.delete(hash);
      });
    this.#pending.set(hash, request);
    return request;
  }

  /** Revokes every URL and abandons the pending fetches; a later load starts afresh. */
  release(): void {
    this.#controller.abort();
    this.#controller = new AbortController();
    this.#pending.clear();
    for (const url of this.#urls.values()) URL.revokeObjectURL(url);
    this.#urls.clear();
  }
}

export const ApprovedImagesContext = createContext<ApprovedImages | null>(null);

/** The object URL of an approved image, or null while none is available (show the fallback). */
export function useApprovedImage(image: PlayerAssetView | null): string | null {
  const images = useContext(ApprovedImagesContext);
  const hash = image?.contentHash ?? null;
  const [loaded, setLoaded] = useState<{
    readonly hash: string;
    readonly url: string | null;
  } | null>(null);
  useEffect(() => {
    if (!images || hash === null) return;
    let current = true;
    void images.load(hash).then((url) => {
      if (current) setLoaded({ hash, url });
    });
    return () => {
      current = false;
    };
  }, [images, hash]);
  if (!images || hash === null) return null;
  return images.peek(hash) ?? (loaded?.hash === hash ? loaded.url : null);
}
