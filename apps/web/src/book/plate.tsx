import { useT } from '@ltw/ui';
import { useRef, type ReactNode } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useHeldImage } from '../visual/approved-images.ts';
import { usePortrait } from '../world/use-portrait.ts';
import type { Plate } from './model.ts';

/**
 * The right page's picture (docs/adr/0074-dm-book.md §3.3): the most exact one the viewer may see
 * — the moment's, else the place's, else the chapter's — and a caption that says which. A press
 * enlarges it. Where there is none, the page says so instead of drawing something in its place.
 */
interface Candidate {
  readonly entityId: string;
  readonly name: string;
  readonly exactness: Plate['exactness'];
}

function Tried({
  api,
  candidates,
  open,
}: {
  readonly api: WorldApi;
  readonly candidates: readonly Candidate[];
  readonly open: boolean;
}): ReactNode {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [first, ...rest] = candidates;
  // The hooks below need an entity: the caller renders this only with at least one candidate.
  const held = useHeldImage(usePortrait(api, first?.entityId ?? ''));
  if (!first) return null;
  if (held.url === null) {
    // Known to be missing: the next, less exact picture is tried.
    if (!held.held && rest.length > 0) return <Tried api={api} candidates={rest} open={open} />;
    return (
      <div className="dmb-plate" data-open={open}>
        <p className="dmb-plate-none">
          {held.held ? t('The picture is loading…') : t('No picture for this page yet')}
        </p>
      </div>
    );
  }
  const what: Record<Plate['exactness'], string> = {
    moment: t('This moment'),
    place: t('This place'),
    chapter: t('The chapter’s place'),
  };
  const caption = `${what[first.exactness]}: ${first.name}`;
  return (
    <figure className="dmb-plate" data-open={open} data-exactness={first.exactness}>
      <button
        type="button"
        className="dmb-plate-frame"
        aria-label={t('Enlarge the picture: {name}', { name: first.name })}
        onClick={() => dialog.current?.showModal()}
      >
        <img src={held.url} alt="" />
      </button>
      <figcaption>{caption}</figcaption>
      <dialog ref={dialog} className="dmb-zoom" aria-label={first.name}>
        <img src={held.url} alt={first.name} />
        <div className="dmb-zoom-foot">
          <p>{caption}</p>
          <button type="button" className="primary-button" onClick={() => dialog.current?.close()}>
            {t('Close')}
          </button>
        </div>
      </dialog>
    </figure>
  );
}

export function PlateFigure({
  api,
  plates,
  entityOf,
  nameOf,
  open,
}: {
  readonly api: WorldApi;
  readonly plates: readonly Plate[];
  /** The world's ID of a package key, when the book's key is an entity of this world. */
  readonly entityOf: (key: string) => string | undefined;
  readonly nameOf: (key: string) => string;
  /** A card is open under the picture: the picture gives it room. */
  readonly open: boolean;
}) {
  const t = useT();
  const candidates = plates.flatMap((plate) => {
    const entityId = entityOf(plate.subject);
    return entityId === undefined
      ? []
      : [{ entityId, name: nameOf(plate.subject), exactness: plate.exactness }];
  });
  if (candidates.length === 0)
    return (
      <div className="dmb-plate" data-open={open}>
        <p className="dmb-plate-none">{t('No picture for this page yet')}</p>
      </div>
    );
  // A new first candidate is a new picture: its own loading, its own dialog.
  return (
    <Tried
      key={candidates.map((c) => c.entityId).join('|')}
      api={api}
      candidates={candidates}
      open={open}
    />
  );
}
