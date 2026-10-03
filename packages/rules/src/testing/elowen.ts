import { characterSheetSchema, type CharacterSheet } from '@ltw/contracts';

import rulesSeed from '../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import { startTurn, type TurnState } from '../turn.ts';

/** Test support: Elowen's approved sheet (ADR 0011), parsed from the Ravenford fixture. */
export function elowen(changes: Partial<CharacterSheet> = {}): CharacterSheet {
  const command = rulesSeed.commands[0];
  if (!command) throw new Error('rules fixture is empty');
  return { ...characterSheetSchema.parse(command.sheet), ...changes };
}

export const myTurn = (): TurnState => startTurn(true);
export const theirTurn = (): TurnState => startTurn(false);
