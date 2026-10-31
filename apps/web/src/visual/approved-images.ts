import type { PlayerAssetView } from '@ltw/contracts';
import { createContext, useContext, useEffect, useState } from 'react';

/** A scoped source of authorized bytes; campaign and draft transports implement the same port. */
export interface ImageReader {
  image(contentHash: string, signal: AbortSignal, at?: number | null): Promise<Blob>;
}

/**
 * Approved world images (ADR 0022, ADR 0026 §6): fetched with the viewer's authorization and
 * shown through object URLs, revoked when the world screen goes away (a perspective change, a
 * refresh, leaving). Held per world screen, so the re-render after an action neither fetches
 * again nor flashes the neutral fallback. A failed fetch leaves the neutral fallback; nothing is
 * ever invented in an image's place. The DM may fetch any asset's bytes, so the DM's image
 * controls show candidates through the same cache (docs/STAGE_330_DESIGN.md "DM controls").
 *
 * Each picture is fetched for the world time its presentation chose it for (`at`; Gate 06): the
 * server serves only what presentation could choose then, so a picture is never asked for "now"
 * after the world moved on. Bytes are immutable by hash: once fetched for one time, they are
 * shown for any (the viewer already holds them); a failed fetch for one time never blocks another.
 */
export class ApprovedImages {
  readonly #api: ImageReader;
  readonly #urls = new Map<string, string>();
  readonly #pending = new Map<string, Promise<string | null>>();
  #controller = new AbortController();

  constructor(api: ImageReader) {
    this.#api = api;
  }

  /** The URL of an image already fetched. */
  peek(hash: string): string | null {
    return this.#urls.get(hash) ?? null;
  }

  /**
   * The URL of an image, fetched once; null when it cannot be fetched. A picture chosen for a
   * past time is fetched for that time (`at`), as the server serves only what could be shown then.
   */
  load(hash: string, at: number | null = null): Promise<string | null> {
    const key = keyOf(hash, at);
    const known = this.#urls.get(hash);
    if (known) return Promise.resolve(known);
    const pending = this.#pending.get(key);
    if (pending) return pending;
    const controller = this.#controller;
    const request = this.#api
      .image(hash, controller.signal, at)
      .then(
        (blob) => {
          if (controller.signal.aborted) return null;
          const held = this.#urls.get(hash);
          if (held) return held;
          const url = URL.createObjectURL(blob);
          this.#urls.set(hash, url);
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

/** The world time each picture of a presentation response was chosen for, by the view object. */
const chosenAt = new WeakMap<object, number>();

const isPicture = (value: object): value is PlayerAssetView =>
  'contentHash' in value && 'mediaType' in value && 'variant' in value;

/**
 * Records, for every picture in a presentation, scene or flashback response, the world time it
 * was chosen for (the response's `worldTime`), so wherever the picture is shown its bytes are
 * fetched for that time. Returns the response itself.
 */
export function withPictureTimes<T extends { readonly worldTime: number }>(response: T): T {
  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (isPicture(value)) {
      chosenAt.set(value, response.worldTime);
    } else {
      for (const item of Object.values(value)) visit(item);
    }
  };
  visit(response);
  return response;
}

/** The world time a picture was chosen for (`withPictureTimes`); null when none was recorded. */
export const pictureTime = (image: PlayerAssetView | null): number | null =>
  image === null ? null : (chosenAt.get(image) ?? null);

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
  const known = images.peek(hash);
  if (known) return { url: known, settled: true };
  return loaded?.key === keyOf(hash, at)
    ? { url: loaded.url, settled: true }
    : { url: null, settled: false };
}

/**
 * The object URL of an approved image, or null while none is available (show the fallback),
 * fetched for the time its presentation chose it for (`pictureTime`, or `at` when given).
 */
export function useApprovedImage(
  image: PlayerAssetView | null,
  at: number | null = pictureTime(image),
): string | null {
  return useContentImage(image?.contentHash ?? null, at).url;
}

/**
 * Whether a picture should hold its place: there is one to show, and it is shown or still
 * loading. False once it is known to be missing or unreadable, so the caller falls back. Fetched
 * for the time its presentation chose it for (`pictureTime`).
 */
export function useHeldImage(image: PlayerAssetView | null): {
  readonly url: string | null;
  readonly held: boolean;
} {
  const { url, settled } = useContentImage(image?.contentHash ?? null, pictureTime(image));
  return { url, held: image !== null && (url !== null || !settled) };
}
