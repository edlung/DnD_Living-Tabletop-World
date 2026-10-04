import type { AuthoringNote, AuthoringWarning } from '@ltw/contracts';

import {
  withOptionIds,
  type ContinuityInput,
  type NoteDraft,
  type WarningDraft,
} from './describe.ts';
import { encounterHere, witnessElsewhere } from './geography.ts';
import { nameInUse, renameKnown } from './identity.ts';
import { disclosureAgainstAttitude, duplicateAccount, secretSubject } from './knowledge.ts';
import { claimFindings } from './lore.ts';
import { movesTheDead, speakerNotAlive } from './timeline.ts';

/**
 * The warnings and notes of a proposal (docs/adr/0019-continuity-engine.md §2),
 * on the provisional world after every operation that applied. These are
 * consent, not legality: the World Engine checks them against the DM's
 * confirmation at commit and never re-decides them (ADR 0018 §4).
 */
const WARNING_CHECKS = [
  nameInUse,
  renameKnown,
  witnessElsewhere,
  encounterHere,
  speakerNotAlive,
  movesTheDead,
  secretSubject,
  duplicateAccount,
  disclosureAgainstAttitude,
] as const;

export function continuityFindings(input: ContinuityInput): {
  readonly warnings: AuthoringWarning[];
  readonly notes: AuthoringNote[];
} {
  const warnings: WarningDraft[] = [];
  const notes: NoteDraft[] = [];
  input.commands.forEach((command, index) => {
    if (!input.applied.has(index)) return;
    for (const check of WARNING_CHECKS) warnings.push(...check(input, command, index));
    const lore = claimFindings(input, command, index);
    warnings.push(...lore.warnings);
    notes.push(...lore.notes);
  });
  return { warnings: warnings.map(withOptionIds), notes };
}
