import type { PlayerAssetView } from '@ltw/contracts';
import { createContext, useContext, useEffect, useState } from 'react';

import type { WorldApi } from '../api/client.ts';

/**
 * Approved world images (ADR 0022, ADR 0026 §6): fetched with the viewer's authorization and
 * shown through object URLs, revoked when the world screen goes away (a perspective change, a
 * refresh, leaving). Held per world screen, so the re-render after an action neither fetches
 * again nor flashes the neutral fallback. A failed fetch leaves the neutral fallback; nothing is
 * ever invented in an image's place. The DM may fetch any asset's bytes, so the DM's image
 * controls show candidates through the same cache (docs/STAGE_330_DESIGN.md "DM controls").
 */
export class ApprovedImages {
  readonly #api: WorldApi;
  readonly #urls = new Map<string, string>();
  readonly #pending = new Map<string, Promise<string | null>>();
  #controller = new AbortController();

  constructor(api: WorldApi) {
    this.#api = api;
  }

  /** The URL of an image already fetched (for that time, when it was chosen for one). */
  peek(hash: string, at: number | null = null): string | null {
    return this.#urls.get(keyOf(hash, at)) ?? null;
  }

  /**
   * The URL of an image, fetched once; null when it cannot be fetched. A picture chosen for a
   * past time is fetched for that time (`at`), as the server serves only what could be shown then.
   */
  load(hash: string, at: number | null = null): Promise<string | null> {
    const key = keyOf(hash, at);
    const known = this.#urls.get(key);
    if (known) return Promise.resolve(known);
    const pending = this.#pending.get(key);
    if (pending) return pending;
    const controller = this.#controller;
    const request = this.#api
      .image(hash, controller.signal, at)
      .then(
        (blob) => {
          if (controller.signal.aborted) return null;
          const url = URL.createObjectURL(blob);
          this.#urls.set(key, url);
          return url;
        },
        () => null,
      )
      .finally(() => {
        if (this.#pending.get(key) === request) this.#pending.delete(key);
      });
    this.#pending.set(key, request);
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

const keyOf = (hash: string, at: number | null) => (at === null ? hash : `${hash}@${String(at)}`);

export const ApprovedImagesContext = createContext<ApprovedImages | null>(null);

/**
 * An image by content hash: its object URL once fetched, and whether that is settled — fetched,
 * failed, or nothing to fetch. While unsettled a caller may hold the picture's place; once
 * settled without a URL it shows the neutral fallback.
 */
export function useContentImage(
  hash: string | null,
  /** The world time the picture was chosen for; null for now. */
  at: number | null = null,
): {
  readonly url: string | null;
  readonly settled: boolean;
} {
  const images = useContext(ApprovedImagesContext);
  const [loaded, setLoaded] = useState<{
    readonly key: string;
    readonly url: string | null;
  } | null>(null);
  useEffect(() => {
    if (!images || hash === null) return;
    let current = true;
    void images.load(hash, at).then((url) => {
      if (current) setLoaded({ key: keyOf(hash, at), url });
    });
    return () => {
      current = false;
    };
  }, [images, hash, at]);
  if (!images || hash === null) return { url: null, settled: true };
  const known = images.peek(hash, at);
  if (known) return { url: known, settled: true };
  return loaded?.key === keyOf(hash, at)
    ? { url: loaded.url, settled: true }
    : { url: null, settled: false };
}

/**
 * The object URL of an approved image, or null while none is available (show the fallback). A
 * picture from a presentation at a past time passes that time (`at`).
 */
export function useApprovedImage(
  image: PlayerAssetView | null,
  at: number | null = null,
): string | null {
  return useContentImage(image?.contentHash ?? null, at).url;
}

/**
 * Whether a picture should hold its place: there is one to show, and it is shown or still
 * loading. False once it is known to be missing or unreadable, so the caller falls back.
 */
export function useHeldImage(image: PlayerAssetView | null): {
  readonly url: string | null;
  readonly held: boolean;
} {
  const { url, settled } = useContentImage(image?.contentHash ?? null);
  return { url, held: image !== null && (url !== null || !settled) };
}
