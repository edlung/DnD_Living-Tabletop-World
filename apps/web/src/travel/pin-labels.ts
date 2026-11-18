/**
 * Where each pin's name goes on a map (docs/adr/0057-encounters-maps-loot.md §10): beside its dot
 * on the right, else on the left, and when neither side is free of the other names and dots, the
 * name waits for the pointer or the keyboard ("quiet") — a crowded map never stacks names on each
 * other. Where the party stands is placed first, then the pins in their order; its name is always
 * shown, over a neighbour's dot if it must (the map draws it on top). Pure.
 */
export interface PinLabel {
  readonly side: 'right' | 'left';
  /** No free side: the name shows on the pointer or focus only, on the side that fits the map. */
  readonly quiet: boolean;
}

export interface PinBox {
  readonly id: string;
  /** The dot's centre, in pixels from the map's top left. */
  readonly x: number;
  readonly y: number;
  /** The name's plate as drawn. */
  readonly width: number;
  readonly height: number;
}

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** From the dot's centre to the near edge of its name, as `.map-pin` draws it (10 + 4 px). */
export const NAME_GAP = 14;
/** A name keeps this far from the map's edge. */
const EDGE = 4;
const DOT = 12;
const overlaps = (a: Rect, b: Rect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

export function pinSides(
  pins: readonly PinBox[],
  frame: { readonly width: number; readonly height: number },
  firstId: string | null,
): Record<string, PinLabel> {
  const taken: Rect[] = pins.map((pin) => ({
    left: pin.x - DOT,
    top: pin.y - DOT,
    right: pin.x + DOT,
    bottom: pin.y + DOT,
  }));
  const order = [
    ...pins.filter((pin) => pin.id === firstId),
    ...pins.filter((pin) => pin.id !== firstId),
  ];
  const sides: Record<string, PinLabel> = {};
  for (const pin of order) {
    const top = pin.y - pin.height / 2;
    const bottom = pin.y + pin.height / 2;
    const candidates: [PinLabel['side'], Rect][] = [
      ['right', { left: pin.x + NAME_GAP, top, right: pin.x + NAME_GAP + pin.width, bottom }],
      ['left', { left: pin.x - NAME_GAP - pin.width, top, right: pin.x - NAME_GAP, bottom }],
    ];
    // Near the right edge the left side is tried first, as the map always drew it.
    if (pin.x > frame.width * 0.6) candidates.reverse();
    const inside = candidates.filter(
      ([, rect]) =>
        rect.left >= EDGE &&
        rect.right <= frame.width - EDGE &&
        rect.top >= EDGE &&
        rect.bottom <= frame.height - EDGE,
    );
    const free =
      inside.find(([, rect]) => !taken.some((other) => overlaps(rect, other))) ??
      (pin.id === firstId ? (inside[0] ?? candidates[0]) : undefined);
    if (free) {
      sides[pin.id] = { side: free[0], quiet: false };
      taken.push(free[1]);
    } else sides[pin.id] = { side: (inside[0] ?? candidates[0])?.[0] ?? 'right', quiet: true };
  }
  return sides;
}
