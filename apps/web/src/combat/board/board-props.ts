import type { EncounterView, PlayerAssetView, Square } from '@ltw/contracts';

import type { LabelOf } from '../labels.ts';
import type { ShownMark } from '../use-marks.ts';
import type { BoardPaint, BoardTools } from './board-controls.tsx';
import type { BoardView } from './board-view.ts';

/** What the board is given (`board.tsx`): the fight, the viewer, and its hands and tools. */
export interface BoardProps {
  readonly encounter: Pick<EncounterView, 'battlefield' | 'combatants'>;
  readonly labelOf: LabelOf;
  /** Only a live encounter has an active turn; prepared layouts omit it. */
  readonly currentCombatantId?: string | null;
  readonly selfId: string | null;
  readonly selected: Square | null;
  /** The advisory route to the selected square, without the mover's own square. */
  readonly path: readonly Square[];
  /**
   * Whose route `path` is: the viewer's, or a creature it commands on that creature's turn
   * (docs/adr/0044-online-play.md §7). Absent: the viewer's.
   */
  readonly moverId?: string | null;
  /** Combatants a previewed area spell would affect, as the server listed them. */
  readonly affected: ReadonlySet<string>;
  readonly imageOf: (entityId: string) => PlayerAssetView | null;
  /** A combatant's approved tabletop figure (ADR 0035 §4), when the place's presentation has it. */
  readonly figureOf: (entityId: string) => PlayerAssetView | null;
  /** The encounter's place's approved battle map: the ground under the grid when there is one. */
  readonly battleMap: PlayerAssetView | null;
  readonly view: BoardView;
  readonly onPick: (square: Square) => void;
  /** A combatant's token dragged to a square: the DM's hand (docs/adr/0057-…md §2). */
  readonly onDropToken?: (entityId: string, square: Square) => void;
  /** The DM's brush (ADR 0057 §2): its toggle, and squares pressed or stroked while it is on. */
  readonly paint?: BoardPaint;
  /**
   * How the fog of war shows (ADR 0057 §4): as a veil the DM sees through, or as darkness — the
   * players' and the display's, whose view leaves out what lies under it.
   */
  readonly fogView?: 'veil' | 'hidden';
  /**
   * The viewer's ruler (docs/adr/0057-encounters-maps-loot.md §5): from its start to its end, or
   * to the square the pointer or the keyboard is on while no end is set.
   */
  readonly ruler?: { readonly from: Square; readonly to: Square | null } | null;
  /** The squares a spell's area laid on the board covers, as `x,y` (ADR 0057 §5). */
  readonly template?: ReadonlySet<string>;
  /** The viewer's ruler and area toggles (ADR 0057 §5). */
  readonly tools?: BoardTools;
  /** The table's shared marks (ADR 0057 §5). */
  readonly marks?: readonly ShownMark[];
  /** A stroke drawn as a mark: presses and drags go to it, as to the DM's brush. */
  readonly draw?: (squares: readonly Square[]) => void;
  /** A square to keep in view when the board scrolls (the table's screen follows the fight). */
  readonly centreOn?: Square | null;
}
