import type { Ability, TrapId } from '@ltw/contracts';

/**
 * The Gameplay Toolbox's eight example traps (SRD 5.2.1 pages 199–201) as the World Engine springs
 * them (docs/adr/0055-rules-reference-and-toolbox.md §4): each tier's save, damage, fall and
 * condition, the numbers the SRD's words and tier tables give (`traps.test.ts` holds them to the
 * text). A pit is a fall (the glossary's Falling: 1d6 per 10 feet, Prone unless it dealt nothing).
 * What the text leaves to the DM — finding and disarming, a net's escape, a stone's course, the
 * rubble's Difficult Terrain — stays the DM's.
 */
export interface TrapDice {
  readonly count: number;
  readonly sides: number;
  readonly damageType: 'bludgeoning' | 'fire' | 'piercing' | 'poison';
}

export interface TrapTier {
  /** The characters' levels it is made for: "1–4". */
  readonly levels: string;
  /** The save each creature it catches makes; none for a pit. */
  readonly save: { readonly ability: Ability; readonly dc: number } | null;
  /** Its damage on a failed save — or on no save at all; half on a success where `half`. */
  readonly damage: readonly TrapDice[];
  /** A dart trap's darts, each dealing the damage: this many dice of these sides (1d3). */
  readonly darts?: { readonly count: number; readonly sides: number };
  /** A pit's depth: the fall it makes. */
  readonly fallFt?: number;
}

export interface TrapRules {
  readonly trapId: TrapId;
  readonly tiers: readonly TrapTier[];
  /** Half the damage on a successful save; otherwise a success takes none. */
  readonly half: boolean;
  /** What a failed save leaves it with. */
  readonly condition: 'prone' | 'restrained' | 'poisoned' | null;
  /** Huge and larger succeed at once (the Net). */
  readonly hugeEscapes: boolean;
}

const LEVELS = ['1–4', '5–10', '11–16', '17–20'] as const;
const DEPTHS = [10, 30, 60, 120] as const;
const at = <T>(list: readonly T[], index: number): T => {
  const value = list[index];
  if (value === undefined) throw new Error(`no tier ${String(index + 1)}`);
  return value;
};
const four = (each: (index: number) => Omit<TrapTier, 'levels'>): TrapTier[] =>
  LEVELS.map((levels, index) => ({ levels, ...each(index) }));
const dice = (count: number, sides: number, damageType: TrapDice['damageType']): TrapDice => ({
  count,
  sides,
  damageType,
});

export const TRAPS: readonly TrapRules[] = [
  {
    trapId: 'collapsing-roof',
    tiers: four((i) => ({
      save: { ability: 'dex', dc: at([13, 15, 17, 19], i) },
      damage: [dice(at([2, 4, 10, 18], i), 10, 'bludgeoning')],
    })),
    half: true,
    condition: null,
    hugeEscapes: false,
  },
  {
    trapId: 'falling-net',
    tiers: four((i) => ({ save: { ability: 'dex', dc: at([10, 12, 14, 16], i) }, damage: [] })),
    half: false,
    condition: 'restrained',
    hugeEscapes: true,
  },
  {
    trapId: 'fire-casting-statue',
    tiers: four((i) => ({
      save: { ability: 'dex', dc: 15 },
      damage: [dice(at([2, 4, 10, 18], i), 10, 'fire')],
    })),
    half: true,
    condition: null,
    hugeEscapes: false,
  },
  {
    trapId: 'hidden-pit',
    tiers: four((i) => ({ save: null, damage: [], fallFt: at(DEPTHS, i) })),
    half: false,
    condition: null,
    hugeEscapes: false,
  },
  {
    trapId: 'poisoned-darts',
    tiers: four((i) => ({
      save: { ability: 'dex', dc: 13 },
      damage: [dice(at([1, 2, 4, 7], i), 6, 'poison')],
      darts: { count: 1, sides: 3 },
    })),
    half: false,
    condition: null,
    hugeEscapes: false,
  },
  {
    trapId: 'poisoned-needle',
    tiers: four((i) => ({
      save: { ability: 'con', dc: at([11, 13, 15, 17], i) },
      damage: [dice(at([1, 2, 4, 10], i), 10, 'poison')],
    })),
    half: true,
    condition: 'poisoned',
    hugeEscapes: false,
  },
  {
    trapId: 'rolling-stone',
    tiers: [
      { levels: '11–20', save: { ability: 'dex', dc: 15 }, damage: [dice(10, 10, 'bludgeoning')] },
    ],
    half: false,
    condition: 'prone',
    hugeEscapes: false,
  },
  {
    trapId: 'spiked-pit',
    tiers: four((i) => ({
      save: null,
      damage: [dice(at([2, 3, 8, 13], i), 8, 'piercing')],
      fallFt: at(DEPTHS, i),
    })),
    half: false,
    condition: null,
    hugeEscapes: false,
  },
];

const byId = new Map(TRAPS.map((trap) => [trap.trapId, trap]));
export const trapRules = (trapId: TrapId): TrapRules => {
  const trap = byId.get(trapId);
  if (!trap) throw new Error(`no trap ${trapId}`);
  return trap;
};
