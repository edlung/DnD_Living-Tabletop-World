import { useT } from '@ltw/ui';
import type { ReactNode, RefObject } from 'react';

import { useReservedHeight } from '../shell/reserved-height.ts';
import { usePaperSurface } from '../shell/sheet.tsx';
import { useScrollEdges } from '../visual/scroll-edges.ts';
import { SPREAD_TALK_ID, useSceneSpread } from './scene-spread.ts';

/**
 * The selection's drawer: the details of what is chosen. Its edge fades where more of them lies
 * beyond it (ui-layout-audit scroll-edge-cut): a long character's details run past a phone's
 * screen, and a cut without a fade reads as their end. In the Scene's spread it is the card on
 * the right page under the plate, on the book's paper, and with nothing chosen the page says
 * where a card comes from (docs/adr/0075-book-interface.md §5).
 */
export function DetailPanel({
  panelRef,
  hidden,
  contentKey,
  battlefield,
  children,
}: {
  readonly panelRef: RefObject<HTMLElement | null>;
  readonly hidden: boolean;
  /** What it shows: its edges are measured again when that changes. */
  readonly contentKey: string;
  /** A fight holds the stage: there is no spread. */
  readonly battlefield: boolean;
  readonly children: ReactNode;
}) {
  const t = useT();
  const edges = useScrollEdges(panelRef, contentKey, 'y');
  const spread = useSceneSpread(battlefield);
  const paper = usePaperSurface();
  // The talk's height: the card stands under it on the spread's right page.
  const talk = useReservedHeight<HTMLDivElement>('--talk-h', spread);
  return (
    <>
      {/* The talk lies here, above the card, while it lasts (scene.tsx puts it in). */}
      {spread && (
        <div ref={talk} id={SPREAD_TALK_ID} className="spread-talk" data-surface={paper} />
      )}
      {spread && (
        <p className="spread-card-hint" hidden={!hidden}>
          {t('Choose a person or a thing on the left page: its card opens here.')}
        </p>
      )}
      <aside
        ref={panelRef}
        className="detail-panel"
        aria-label={t('Entity details')}
        tabIndex={-1}
        hidden={hidden}
        data-surface={paper}
        data-more-before={edges.before ? '' : undefined}
        data-more-after={edges.after ? '' : undefined}
      >
        {children}
      </aside>
    </>
  );
}
