import type { EncounterView, SubstitutionReason } from '@ltw/contracts';
import { createContext, useContext, useEffect } from 'react';

import type { StandInReason } from '../exploration/use-action.ts';

/**
 * The DM acting for a player's character (docs/adr/0033-live-session.md §6; design §B), after
 * choosing to and saying why. It grants nothing: the kernel already lets the DM issue a
 * player's commands, and every command the DM submits this way records the reason first.
 */
export interface StandIn {
  readonly characterId: string;
  readonly name: string;
  readonly reason: SubstitutionReason;
  readonly note: string | null;
  /**
   * Taken from the fold-out for this turn or this reaction only (ADR 0075 §17): when the
   * character has nothing more to do now, the DM is back in the DM's own view.
   */
  readonly untilDone?: boolean;
}

/** The reason as each command records it. */
export const standInReason = (standIn: StandIn): StandInReason => ({
  characterId: standIn.characterId,
  reason: standIn.reason,
  ...(standIn.note === null ? {} : { note: standIn.note }),
});

export interface StandInChoice {
  readonly characterId: string;
  readonly name: string;
  /** Whose turn it is: the DM may skip it. */
  readonly current: boolean;
}

/**
 * Characters the DM may act for now: the one whose turn it is, and any the open reaction
 * window still waits on. Whether one has a player is the server's to say when the reason is
 * recorded; presence is never consulted.
 */
export function standInChoices(encounter: EncounterView): StandInChoice[] {
  const characters = new Map(
    encounter.combatants
      .filter((entry) => entry.entity.kind === 'character' && entry.state !== 'dead')
      .map((entry) => [entry.entity.entityId, entry.entity.name ?? entry.entity.entityId]),
  );
  const waiting = (encounter.reactionWindow?.candidates ?? [])
    .filter((candidate) => candidate.response === 'pending')
    .map((candidate) => candidate.entityId);
  const ids = [encounter.currentCombatantId, ...waiting].filter(
    (id, index, all) => characters.has(id) && all.indexOf(id) === index,
  );
  return ids.map((characterId) => ({
    characterId,
    name: characters.get(characterId) ?? characterId,
    current: characterId === encounter.currentCombatantId,
  }));
}

/** The DM acting for a character now, and the way back: read by the fight's stage. */
export interface Acting {
  readonly standIn: StandIn;
  readonly stop: () => void;
}
export const ActingContext = createContext<Acting | null>(null);

/**
 * A turn or a reaction taken from the fold-out ends with it (ADR 0075 §17): once the character
 * is no longer one the DM may act for now, the DM's own view comes back by itself. A stand-in
 * begun on the Encounter page with its reason stays until "Stop acting", as before.
 */
export function useReturnWhenDone(encounter: EncounterView): void {
  const acting = useContext(ActingContext);
  const done =
    acting !== null &&
    acting.standIn.untilDone === true &&
    !standInChoices(encounter).some((choice) => choice.characterId === acting.standIn.characterId);
  const stop = acting?.stop;
  useEffect(() => {
    if (done) stop?.();
  }, [done, stop]);
}
