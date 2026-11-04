import { useT } from '@ltw/ui';
import type { ReactNode, RefObject } from 'react';

import { useScrollEdges } from '../visual/scroll-edges.ts';

/**
 * The selection's drawer: the details of what is chosen. Its edge fades where more of them lies
 * beyond it (ui-layout-audit scroll-edge-cut): a long character's details run past a phone's
 * screen, and a cut without a fade reads as their end.
 */
export function DetailPanel({
  panelRef,
  hidden,
  contentKey,
  children,
}: {
  readonly panelRef: RefObject<HTMLElement | null>;
  readonly hidden: boolean;
  /** What it shows: its edges are measured again when that changes. */
  readonly contentKey: string;
  readonly children: ReactNode;
}) {
  const t = useT();
  const edges = useScrollEdges(panelRef, contentKey, 'y');
  return (
    <aside
      ref={panelRef}
      className="detail-panel"
      aria-label={t('Entity details')}
      tabIndex={-1}
      hidden={hidden}
      data-more-before={edges.before ? '' : undefined}
      data-more-after={edges.after ? '' : undefined}
    >
      {children}
    </aside>
  );
}
