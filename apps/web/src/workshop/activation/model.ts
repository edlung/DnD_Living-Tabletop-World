import {
  startCampaignActivationSchema,
  type CampaignActivationReview,
  type CampaignActivationView,
  type StartCampaignActivation,
} from '@ltw/contracts';

export const activationWarningIds = (review: CampaignActivationReview): readonly string[] =>
  review.findings
    .filter((finding) => finding.severity === 'warning')
    .map((finding) => finding.findingId);

/** Every consent field comes from this exact server review, never from a package in the browser. */
export function activationIntent(
  review: CampaignActivationReview,
  acknowledged: ReadonlySet<string>,
  requestId: string,
): StartCampaignActivation | null {
  const warnings = activationWarningIds(review);
  if (
    !review.confirmable ||
    review.readiness !== 'READY' ||
    review.activation !== null ||
    review.findings.some((finding) => finding.severity === 'error') ||
    warnings.some((id) => !acknowledged.has(id))
  )
    return null;
  return startCampaignActivationSchema.parse({
    requestId,
    revision: review.revision,
    packageDigest: review.packageDigest,
    planDigest: review.planDigest,
    manifestVersion: review.manifestVersion,
    manifestDigest: review.manifestDigest,
    expectedLockVersion: review.lockVersion,
    lockDigest: review.lockDigest,
    reviewDigest: review.reviewDigest,
    acknowledgedFindingIds: warnings,
    textOnly: review.textOnly,
  });
}

export function matchesActivationReview(
  review: CampaignActivationReview,
  draftId: string,
  revision: number,
  textOnly: boolean,
): boolean {
  return review.draftId === draftId && review.revision === revision && review.textOnly === textOnly;
}

export function matchesActivationIntent(
  activation: CampaignActivationView,
  intent: StartCampaignActivation,
  draftId: string,
): boolean {
  return (
    activation.draftId === draftId &&
    activation.revision === intent.revision &&
    activation.packageDigest === intent.packageDigest &&
    activation.planDigest === intent.planDigest &&
    activation.manifestDigest === intent.manifestDigest &&
    activation.textOnly === intent.textOnly
  );
}

/** Publication never regresses to a late provisioning response. */
export function newestActivation(
  first: CampaignActivationView | null,
  second: CampaignActivationView | null,
): CampaignActivationView | null {
  if (!first) return second;
  if (!second || first.status === 'PUBLISHED') return first;
  if (second.status === 'PUBLISHED') return second;
  return first.updatedAt >= second.updatedAt ? first : second;
}
