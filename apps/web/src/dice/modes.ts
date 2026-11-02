import type { Check, D20Modes, RollMode } from '@ltw/contracts';

/**
 * How a character's d20 roll comes out under its conditions (docs/adr/0045-conditions-and-actions.md
 * §1, §3), looked up in what the server computed (`CheckRequestsResponse.d20`); the client never
 * combines Advantage and Disadvantage itself. Without the lookups, the asked mode.
 */
export function rolledMode(d20: D20Modes | undefined, check: Check, asked: RollMode): RollMode {
  if (!d20) return asked;
  return check.kind === 'save' ? d20.saves[check.ability][asked] : d20.checks[asked];
}

/** A saving throw the character's conditions fail outright. */
export const failsOutright = (d20: D20Modes | undefined, check: Check): boolean =>
  check.kind === 'save' && (d20?.autoFail.includes(check.ability) ?? false);

/** The d20s a roll in this mode needs: two with Advantage or Disadvantage. */
export const d20sFor = (mode: RollMode): number[] => (mode === 'normal' ? [20] : [20, 20]);
