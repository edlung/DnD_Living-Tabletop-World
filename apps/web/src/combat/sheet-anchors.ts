import type { EncounterView } from '@ltw/contracts';
import { useLayoutEffect, type RefObject } from 'react';

/** Between the figure and its slip (CSS pixels): clear of the name plate, wider than the square. */
const GAP = 18;
/** The sheet's rim and the paper's margin inside it. */
const EDGE = 24;

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}
interface Spot {
  readonly x: number;
  readonly y: number;
  readonly box: Box;
}
type Side = 'left' | 'right' | 'under' | 'over';

const meets = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const boxOf = (element: Element, origin: DOMRect): Box => {
  const at = element.getBoundingClientRect();
  return {
    left: at.left - origin.left,
    top: at.top - origin.top,
    right: at.right - origin.left,
    bottom: at.bottom - origin.top,
  };
};

/**
 * Where the slip of the turn lies on the fight's sheet (docs/adr/0075-book-interface.md §31): beside
 * the figure whose turn it is. Try the side toward the centre first, then the outer side, below
 * and above. Keep interactive panels, the chosen square, figures and their plates clear. When
 * the map is crowded, minimise overlaps in that order. The sheet positions the slip using its
 * corner (`--slip-x`, `--slip-y`) and side (`data-actor-slip`).
 */
export function useSheetAnchors(
  panel: RefObject<HTMLElement | null>,
  encounter: Pick<EncounterView, 'combatants' | 'currentCombatantId'>,
  target: { readonly x: number; readonly y: number } | null = null,
): void {
  const actorId = encounter.currentCombatantId;
  const actor = encounter.combatants.find((entry) => entry.entity.entityId === actorId)?.position;
  const x = actor?.x ?? null;
  const y = actor?.y ?? null;
  const targetX = target?.x ?? null;
  const targetY = target?.y ?? null;
  useLayoutEffect(() => {
    const section = panel.current;
    const host = section?.closest<HTMLElement>('.stage--battle');
    const board = section?.querySelector<HTMLElement>('.board');
    if (!section || !host || !board) return;
    let frame = 0;
    const later = () => {
      if (frame === 0) frame = requestAnimationFrame(place);
    };
    const sizes = new ResizeObserver(later);
    // The slip comes and goes with the turn: the DM's beside the stage, a player's in the panel.
    const arrivals = new MutationObserver(later);
    const forget = () => {
      for (const part of ['x', 'y']) host.style.removeProperty(`--slip-${part}`);
      delete host.dataset['actorSlip'];
    };
    const squareAt = (sx: number | null, sy: number | null) =>
      sx === null || sy === null
        ? null
        : board.querySelector<HTMLElement>(
            `.board-square[data-x="${String(sx)}"][data-y="${String(sy)}"]`,
          );
    const place = (): void => {
      frame = 0;
      const cell = squareAt(x, y);
      const slip = host.querySelector<HTMLElement>(':scope > .dm-turn, .turn-tray');
      if (!cell || !slip) {
        forget();
        return;
      }
      sizes.observe(slip);
      const origin = host.getBoundingClientRect();
      const room = boxOf(host.querySelector('.stage-backdrop') ?? host, origin);
      // The figure and its name plate, which is wider than its square.
      const square = boxOf(cell, origin);
      const plate = actorId
        ? board.querySelector(`.board-plate[data-entity="${CSS.escape(actorId)}"]`)
        : null;
      const own = plate ? boxOf(plate, origin) : square;
      const figure = cell.querySelector('.token.is-current .token-figure');
      const body = figure ? boxOf(figure, origin) : square;
      const at: Box = {
        left: Math.min(square.left, own.left, body.left),
        top: Math.min(square.top, own.top, body.top),
        right: Math.max(square.right, own.right, body.right),
        bottom: Math.max(square.bottom, own.bottom, body.bottom),
      };
      const width = slip.offsetWidth;
      const height = slip.offsetHeight;
      const world = host.closest('main') ?? host;
      const obstacles = [
        ...world.querySelectorAll(
          '.board-controls, .combat-side, .active-card, .fight-quiet, .dm-turn-end, .book-foot, .book-parts, .outcome, .rest-banner-slot',
        ),
      ]
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          if (bounds.width < 4 || bounds.height < 4) return false;
          sizes.observe(element);
          return true;
        })
        .map((element) => boxOf(element, origin));
      const head = host.querySelector('.initiative');
      const top = Math.max(room.top + EDGE, head ? boxOf(head, origin).bottom + 5 : 0);
      const bottom = room.bottom - EDGE;
      const left = room.left + EDGE;
      const right = room.right - EDGE;
      const within = (px: number, py: number): Spot => {
        const cx = Math.min(Math.max(px, left), Math.max(left, right - width));
        const cy = Math.min(Math.max(py, top), Math.max(top, bottom - height));
        return { x: cx, y: cy, box: { left: cx, top: cy, right: cx + width, bottom: cy + height } };
      };
      const middleX = (at.left + at.right) / 2;
      const middleY = (at.top + at.bottom) / 2;
      // Each side's spot level with the figure first, then slid along that side.
      const along = (side: Side): Spot[] => {
        if (side === 'right' || side === 'left') {
          const px = side === 'right' ? at.right + GAP : at.left - GAP - width;
          return [middleY - height / 2, at.bottom - height / 4, at.top - (height * 3) / 4].map(
            (py) => within(px, py),
          );
        }
        const py = side === 'under' ? at.bottom + GAP : at.top - GAP - height;
        return [middleX - width / 2, at.left, at.right - width].map((px) => within(px, py));
      };
      const inward: Side = middleX < (room.left + room.right) / 2 ? 'right' : 'left';
      const order: Side[] = [inward, inward === 'left' ? 'right' : 'left', 'under', 'over'];
      // What the slip leaves in view: every figure and plate, the chosen square most of all.
      const marks = [...board.querySelectorAll('.token-figure, .board-plate')].map((element) =>
        boxOf(element, origin),
      );
      const chosen = squareAt(targetX, targetY);
      const aim = chosen ? boxOf(chosen, origin) : null;
      const cost = (spot: Spot) =>
        obstacles.filter((mark) => meets(mark, spot.box)).length * 100 +
        marks.filter((mark) => meets(mark, spot.box)).length +
        (aim && meets(aim, spot.box) ? 10 : 0) +
        (meets(at, spot.box) ? 1000 : 0);
      let side: Side = order[0] ?? 'right';
      let spot: Spot | null = null;
      let least = Number.POSITIVE_INFINITY;
      search: for (const each of order) {
        for (const candidate of along(each)) {
          const spent = cost(candidate);
          if (spent < least) {
            side = each;
            spot = candidate;
            least = spent;
          }
          if (spent === 0) break search;
        }
      }
      if (!spot) return;
      host.style.setProperty('--slip-x', `${String(Math.round(spot.x))}px`);
      host.style.setProperty('--slip-y', `${String(Math.round(spot.y))}px`);
      host.dataset['actorSlip'] = side;
    };
    place();
    sizes.observe(host);
    sizes.observe(board);
    arrivals.observe(host, { childList: true, subtree: true });
    host.addEventListener('scroll', later, true);
    window.addEventListener('resize', later);
    return () => {
      sizes.disconnect();
      arrivals.disconnect();
      window.removeEventListener('resize', later);
      host.removeEventListener('scroll', later, true);
      if (frame !== 0) cancelAnimationFrame(frame);
      forget();
    };
  }, [panel, actorId, x, y, targetX, targetY]);
}
