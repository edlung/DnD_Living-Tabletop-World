import type { AuthoringConfirmation, RiskLevel } from '@ltw/contracts';

import type { Rejection, ResolvedCommand } from '../kernel/decision.ts';

/**
 * The commit-time consent gate (docs/adr/0018-ai-authoring.md §4). Deciding
 * `ApplyAuthoring` states what the DM must have confirmed: the proposal's
 * risk level and its warnings, computed on the state the commit is decided
 * against. The World Engine refuses a commit whose confirmation does not
 * cover it. Consent is not a premise: re-decision does not repeat it.
 */
export interface ConsentRequirement {
  readonly riskLevel: RiskLevel;
  /** Warning keys, `CODE@index` or `CODE@index:entityId`. */
  readonly warnings: readonly string[];
}

const RANK: Readonly<Record<RiskLevel, number>> = { L1: 1, L2: 2, L3: 3, L4: 4 };

export function highestRisk(levels: Iterable<RiskLevel>): RiskLevel {
  let highest: RiskLevel = 'L1';
  for (const level of levels) if (RANK[level] > RANK[highest]) highest = level;
  return highest;
}

/** What the confirmation lacks, or null when it covers the requirement. */
export function missingConsent(
  confirmation: AuthoringConfirmation,
  requirement: ConsentRequirement,
): { readonly riskLevel: RiskLevel | null; readonly warnings: readonly string[] } | null {
  const riskLevel =
    RANK[confirmation.riskLevel] < RANK[requirement.riskLevel] ? requirement.riskLevel : null;
  const acknowledged = new Set(confirmation.acknowledgedWarnings);
  const warnings = requirement.warnings.filter((key) => !acknowledged.has(key));
  return riskLevel === null && warnings.length === 0 ? null : { riskLevel, warnings };
}

/** Applied by the World Engine after a decision and before appending. */
export function consentRejection(
  command: ResolvedCommand,
  requires: ConsentRequirement | undefined,
): Rejection | null {
  if (command.type !== 'ApplyAuthoring') {
    if (requires) throw new Error(`${command.type} cannot require consent`);
    return null;
  }
  if (!requires) throw new Error('ApplyAuthoring was decided without its consent requirement');
  const missing = missingConsent(command.confirmation, requires);
  if (!missing) return null;
  return {
    code: 'CONFIRMATION_REQUIRED',
    message: 'The confirmation does not cover the proposal as it stands now',
    details: {
      required: { riskLevel: requires.riskLevel, warnings: [...requires.warnings] },
      missing: { riskLevel: missing.riskLevel, warnings: [...missing.warnings] },
    },
  };
}
