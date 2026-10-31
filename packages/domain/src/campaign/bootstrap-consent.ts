import type { Rejection, ResolvedCommand } from '../kernel/decision.ts';

export interface BootstrapConsentRequirement {
  readonly packageDigest: string;
  readonly planDigest: string;
  readonly visualManifestDigest: string;
}
/** Exact owner-confirmed bindings; external review/finding hashes are checked at durable acceptance. */
export function bootstrapConsentRejection(
  command: ResolvedCommand,
  required: BootstrapConsentRequirement | undefined,
): Rejection | null {
  if (command.type !== 'BootstrapCampaign') {
    if (required) throw new Error('Unexpected bootstrap consent');
    return null;
  }
  if (!required) throw new Error('Bootstrap was decided without its confirmation requirement');
  const confirmation = command.confirmation;
  return confirmation.packageDigest !== required.packageDigest ||
    confirmation.planDigest !== required.planDigest ||
    confirmation.visualManifestDigest !== required.visualManifestDigest ||
    new Set(confirmation.acknowledgedFindingIds).size !== confirmation.acknowledgedFindingIds.length
    ? {
        code: 'CONFIRMATION_REQUIRED',
        message: 'The confirmation does not cover the exact prepared campaign',
      }
    : null;
}
