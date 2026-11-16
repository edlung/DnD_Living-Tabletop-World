import type { EntityPresentationResponse, EntityRef } from '@ltw/contracts';
import { createContext, useContext, useEffect, useRef, useState, type RefObject } from 'react';

import type { WorldApi } from '../../api/client.ts';
import { useContentImage } from '../../visual/approved-images.ts';

/**
 * The book's pictures (docs/adr/0072-keepsakes.md §1): a place or a face as the party saw it at
 * the world time its chapter ends — asked for that time, its bytes fetched for the time the
 * presentation chose it for (Gate 06) — or nothing. A picture that is not approved, not the
 * party's to see, or not read leaves no stand-in: a keepsake shows what was there.
 */

/** What a page still waits for before it may be printed: each picture holds it while unread. */
export interface PictureHolds {
  /** Holds the page; the function it returns lets go. */
  hold(): () => void;
}
export const PictureHoldsContext = createContext<PictureHolds | null>(null);

/** How wide a picture is drawn for paper, in pixels: a full line of A4 at about 200 to the inch. */
export const PAPER_PIXELS = 1600;

/**
 * A picture as paper needs it: no wider than `width`, as a JPEG on white. The world's pictures
 * are kept at the size a large screen shows; a PDF holding each of them whole weighs many times
 * what its pages can show. Null when the browser cannot draw it: the picture prints as it is.
 */
async function forPaper(url: string, width: number): Promise<string | null> {
  try {
    const picture = new Image();
    picture.src = url;
    await picture.decode();
    // Narrower pictures are drawn again too: a lossless one weighs many times its JPEG.
    const wide = Math.min(width, picture.naturalWidth);
    if (wide === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = wide;
    canvas.height = Math.round((picture.naturalHeight * wide) / picture.naturalWidth);
    const pen = canvas.getContext('2d');
    if (!pen) return null;
    pen.fillStyle = '#fff';
    pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const drawn = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.86);
    });
    return drawn === null ? null : URL.createObjectURL(drawn);
  } catch {
    return null;
  }
}

/** On paper (where a page holds its print for its pictures) the picture drawn for paper. */
function usePaperPicture(
  url: string | null,
  width: number,
): { readonly url: string | null; readonly pending: boolean } {
  const paper = useContext(PictureHoldsContext) !== null;
  const [copy, setCopy] = useState<{ readonly of: string; readonly url: string } | null>(null);
  useEffect(() => {
    if (!paper || url === null) return;
    let current = true;
    let made: string | null = null;
    void forPaper(url, width).then((smaller) => {
      if (!current) {
        if (smaller !== null) URL.revokeObjectURL(smaller);
        return;
      }
      made = smaller;
      setCopy({ of: url, url: smaller ?? url });
    });
    return () => {
      current = false;
      if (made !== null) URL.revokeObjectURL(made);
    };
  }, [paper, url, width]);
  if (!paper || url === null) return { url, pending: false };
  return copy?.of === url ? { url: copy.url, pending: false } : { url: null, pending: true };
}

/**
 * The picture's URL, or null; `pending` while that is not yet known. `wanted` false asks for
 * nothing (a chapter far down the page). `at` null is now. `width` is the widest paper draws it.
 */
export function useBookPicture(
  api: WorldApi,
  entityId: string | null,
  at: number | null,
  wanted: boolean,
  width: number = PAPER_PIXELS,
): { readonly url: string | null; readonly pending: boolean } {
  const asked = wanted && entityId !== null;
  // Read once: a picture chosen for a past hour does not change with the table's every move, and
  // a long book would ask for each of its pictures again at each of them.
  const [read, setRead] = useState<{
    readonly key: string;
    readonly shown: EntityPresentationResponse | null;
  } | null>(null);
  const key = `${entityId ?? ''}:${String(at)}`;
  useEffect(() => {
    if (!asked) return undefined;
    const stop = new AbortController();
    api
      .get<EntityPresentationResponse>(
        `entities/${encodeURIComponent(entityId)}/presentation`,
        stop.signal,
        true,
        at === null ? undefined : { at: String(at) },
      )
      .then(
        (shown) => {
          if (!stop.signal.aborted) setRead({ key, shown });
        },
        () => {
          // Not the party's to see, or not read: no picture.
          if (!stop.signal.aborted) setRead({ key, shown: null });
        },
      );
    return () => {
      stop.abort();
    };
  }, [api, entityId, at, asked, key]);
  const reading = asked && read?.key !== key;
  const shown = read?.key === key ? read.shown : null;
  const image = shown?.presentation.image ?? null;
  const picture = useContentImage(image?.contentHash ?? null, shown?.worldTime ?? at);
  const drawn = usePaperPicture(picture.url, width);
  const pending = asked && (reading || (image !== null && !picture.settled) || drawn.pending);
  const holds = useContext(PictureHoldsContext);
  useEffect(() => (holds && pending ? holds.hold() : undefined), [holds, pending]);
  return { url: drawn.url, pending };
}

/**
 * Whether an element has come near the reader's view (it stays so): a long book reads each
 * chapter's pictures as it comes up. `eager` is near at once — paper prints every page.
 */
export function useNear<T extends Element>(
  eager: boolean,
): readonly [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(eager || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = ref.current;
    if (near || !element) return;
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      // Near within the page that scrolls: a margin around the window stops at that page's edge.
      { root: element.closest('.keepsake-scroll'), rootMargin: '800px 0px' },
    );
    watch.observe(element);
    return () => {
      watch.disconnect();
    };
  }, [near]);
  return [ref, near];
}

/** A chapter's place, wide, with its name under it; its room is held while it is read. */
export function BookPlate({
  api,
  place,
  at,
  wanted,
}: {
  readonly api: WorldApi;
  readonly place: EntityRef;
  readonly at: number;
  readonly wanted: boolean;
}) {
  const { url, pending } = useBookPicture(api, place.entityId, at, wanted);
  if (url === null && (!pending || !wanted)) {
    // Not read yet (far down the page) holds the room; read and absent leaves none.
    return wanted ? null : <div className="keepsake-plate is-waiting" aria-hidden="true" />;
  }
  return (
    <figure className={`keepsake-plate${url === null ? ' is-waiting' : ''}`}>
      {url !== null && <img src={url} alt="" draggable={false} />}
      <figcaption>{place.name}</figcaption>
    </figure>
  );
}

/** A face with its name: the portrait when there is one, the name alone when there is none. */
export function BookFace({
  api,
  who,
  at,
  wanted,
}: {
  readonly api: WorldApi;
  readonly who: EntityRef;
  /** The world time to see them at; null for now (the heroes on the cover). */
  readonly at: number | null;
  readonly wanted: boolean;
}) {
  const { url } = useBookPicture(api, who.entityId, at, wanted, PAPER_PIXELS / 4);
  return (
    <li className="keepsake-face">
      {url !== null && <img src={url} alt="" draggable={false} />}
      <span>{who.name}</span>
    </li>
  );
}

/** A gallery's picture with its caption; nothing when there is no picture to show. */
export function BookTile({
  api,
  entity,
  at,
  wanted,
  caption = entity.name,
  alt = '',
}: {
  readonly api: WorldApi;
  readonly entity: { readonly entityId: string; readonly name: string | null };
  readonly at: number | null;
  readonly wanted: boolean;
  readonly caption?: string | null;
  /** What the picture shows, where no caption beside it says so. */
  readonly alt?: string;
}) {
  const { url } = useBookPicture(api, entity.entityId, at, wanted, PAPER_PIXELS / 2);
  if (url === null) return null;
  return (
    <figure className="keepsake-tile">
      <img src={url} alt={alt} draggable={false} />
      {caption !== null && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
