import { campaignIdSchema, type RollEntry, type TableDice } from '@ltw/contracts';
import { knownEntityIds, type ResolvedPerspective } from '@ltw/domain';
import { z } from 'zod';

import type { PerspectiveContext } from '../http/request-context.ts';
import { EnteredDice, EnteredFacesError, type DiceSource } from './table-rolls.ts';
import type { RestStore, TableRollRecord, TableStore } from './table-store.ts';
import type { WorldRoll } from './world-rolls.ts';

/*
 * Who may see a table roll, roll for a character and enter its own dice's faces, and a roll as the
 * client receives it (Stage 510; docs/adr/0044-online-play.md §4): shared by the rolls' routes.
 */

export interface TableDependencies {
  readonly store: TableStore;
  /** The DM's open short rests (Stage 530, `src/rest/`). */
  readonly rests: RestStore;
  readonly dice: DiceSource;
  readonly now: () => string;
  /** The campaign's dice (ADR 0044 §4, the table's state); none: the app's. */
  readonly diceOf?: (campaignId: string) => Promise<TableDice>;
}

export const rollParams = z.object({ campaignId: campaignIdSchema, rollId: z.uuid() }).strict();
/**
 * Whether this perspective may enter the faces of its own dice: the DM always (behind the
 * screen), a player where the campaign's dice are the players' own (docs/adr/0044-online-play.md
 * §4).
 */
export async function mayEnter(
  table: TableDependencies,
  perspective: ResolvedPerspective,
  campaignId: string,
): Promise<boolean> {
  if (perspective.kind === 'DM') return true;
  return (await table.diceOf?.(campaignId)) === 'physical';
}

/** A roll from entered faces, or null when they do not fit its dice (too few, too many, off a die). */
export function fromFaces<T>(faces: readonly number[], roll: (dice: DiceSource) => T): T | null {
  const entered = new EnteredDice(faces);
  try {
    const result = roll(entered);
    return entered.spent ? result : null;
  } catch (error) {
    if (error instanceof EnteredFacesError) return null;
    throw error;
  }
}

/** Who may see a roll, and under which name (never a hidden character's). */
export function viewer(context: Omit<PerspectiveContext, 'history'>) {
  const { state, perspective } = context;
  const dm = perspective.kind === 'DM';
  const own = perspective.kind === 'CHARACTER' ? perspective.holderId : null;
  const known = dm ? null : knownEntityIds(state, perspective);
  const sees = (id: string) => dm || id === own || (known?.has(id) ?? false);
  return {
    dm,
    own,
    roller: (id: string | null): RollEntry['roller'] =>
      id === null
        ? null
        : { entityId: id, name: sees(id) ? (state.entities.get(id)?.name ?? null) : null },
    world: (roll: WorldRoll) =>
      dm || (!roll.dmOnly && roll.rollerId !== null && roll.rollerId === own),
    // A roll between the DM and one player is that player's only (ADR 0044 §4).
    table: (roll: TableRollRecord) =>
      dm ||
      (!roll.hidden &&
        (roll.audienceId === null
          ? roll.rollerId === null || sees(roll.rollerId)
          : roll.audienceId === own)),
  };
}

/** A roll as the client receives it: an explicit whitelist, nothing internal. */
export const entryOf = (
  roll: {
    readonly rollId: string;
    readonly subject: RollEntry['subject'];
    readonly groups: RollEntry['groups'];
    readonly hidden: boolean;
    readonly entered?: boolean;
    readonly confirmed?: boolean;
    readonly audienceId?: string | null;
    readonly rerollOf?: string | null;
    readonly rerolled?: boolean;
    readonly at: string;
  },
  roller: RollEntry['roller'],
): RollEntry => ({
  rollId: roll.rollId,
  roller,
  subject: roll.subject,
  groups: roll.groups,
  hidden: roll.hidden,
  ...(roll.entered === true ? { entered: true } : {}),
  ...(roll.entered === true && roll.confirmed === true ? { confirmed: true } : {}),
  ...(roll.audienceId !== undefined && roll.audienceId !== null ? { private: true } : {}),
  ...(roll.rerollOf ? { rerollOf: `table:${roll.rerollOf}` } : {}),
  ...(roll.rerolled === true ? { rerolled: true } : {}),
  at: roll.at,
});

export const tableEntry = (
  roll: TableRollRecord,
  roller: RollEntry['roller'],
  rerolled = false,
): RollEntry => entryOf({ ...roll, rollId: `table:${roll.rollId}`, rerolled }, roller);

/** Whether this perspective may roll for that character: its own, or any for the DM. */
export const rollsFor = (perspective: ResolvedPerspective, characterId: string) =>
  perspective.kind === 'DM' ||
  (perspective.kind === 'CHARACTER' && perspective.holderId === characterId);
