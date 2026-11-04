import type { Battlefield, SavedEncounterView, SavedFoe, Square } from '@ltw/contracts';
import { useState } from 'react';

import {
  foeSquares,
  layoutProblem,
  partyStartSquares,
  type CreatureSize,
  type LaidToken,
  type LayoutProblem,
} from './encounter-layout.ts';

/**
 * Where a built encounter's tokens stand (docs/adr/0057-encounters-maps-loot.md §1): laid out from
 * the edges as foes are added, and wherever the DM moved one on the builder's board — a move kept
 * for that foe (the n-th of its kind) or that party place while the builder is open, and saved.
 */
/** A foe without its square: a bestiary entry or one of the campaign's creatures. */
export type FoeRef =
  | { readonly kind: 'bestiary'; readonly monsterId: string }
  | { readonly kind: 'creature'; readonly entityId: string };

export interface Pick {
  readonly key: string;
  readonly foe: FoeRef;
  readonly name: string;
  readonly size: CreatureSize;
  readonly count: number;
}

export const keyOf = (foe: FoeRef) =>
  foe.kind === 'bestiary' ? `b:${foe.monsterId}` : `c:${foe.entityId}`;
const foeKey = (pickKey: string, n: number) => `${pickKey}#${String(n)}`;
const partyKey = (n: number) => `party#${String(n)}`;

/** Where the saved encounter put each token: the n-th foe of each kind, each party place. */
function savedSquares(encounter: SavedEncounterView | null): Map<string, Square> {
  const squares = new Map<string, Square>();
  const seen = new Map<string, number>();
  for (const view of encounter?.foes ?? []) {
    const key = keyOf(view.foe);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    squares.set(foeKey(key, n), view.foe.position);
  }
  encounter?.partyStart.forEach((square, n) => {
    squares.set(partyKey(n), square);
  });
  return squares;
}

export interface BuilderLayout {
  readonly tokens: readonly LaidToken[];
  /** The foes on their squares; null while some do not fit on the field. */
  readonly foes: readonly SavedFoe[] | null;
  readonly partyStart: readonly Square[];
  readonly problem: LayoutProblem | null;
  readonly move: (key: string, square: Square) => void;
}

export function useBuilderLayout(
  encounter: SavedEncounterView | null,
  picks: readonly Pick[],
  ground: Battlefield,
  party: { readonly count: number; readonly name: (n: number) => string },
): BuilderLayout {
  const [moved, setMoved] = useState(() => savedSquares(encounter));
  const instances = picks.flatMap((pick) =>
    Array.from({ length: pick.count }, (_, n) => ({
      pick,
      key: foeKey(pick.key, n),
      name: pick.count > 1 ? `${pick.name} ${String(n + 1)}` : pick.name,
    })),
  );
  const auto = foeSquares(
    instances.map((one) => one.pick.size),
    ground,
  );
  const foes = instances.map((one, index) => moved.get(one.key) ?? auto?.[index] ?? null);
  const fits = foes.every((square) => square !== null);
  const partyStart = partyStartSquares(party.count, ground).map(
    (square, n) => moved.get(partyKey(n)) ?? square,
  );
  const tokens: LaidToken[] = [
    ...partyStart.map((position, n) => ({
      key: partyKey(n),
      side: 'party' as const,
      name: party.name(n),
      size: 'medium' as const,
      position,
    })),
    ...instances.flatMap((one, index) => {
      const position = foes[index];
      return position
        ? [
            {
              key: one.key,
              side: 'hostile' as const,
              name: one.name,
              size: one.pick.size,
              position,
            },
          ]
        : [];
    }),
  ];
  return {
    tokens,
    foes: fits
      ? instances.map((one, index) => ({
          ...one.pick.foe,
          position: foes[index] ?? { x: 0, y: 0 },
        }))
      : null,
    partyStart,
    problem: layoutProblem(tokens, ground),
    move: (key, square) => {
      setMoved((current) => new Map(current).set(key, square));
    },
  };
}
