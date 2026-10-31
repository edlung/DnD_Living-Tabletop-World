import type {
  CampaignActivationFinding,
  CampaignActivationReview,
  CampaignFinding,
} from '@ltw/contracts';
import { buildCampaignBootstrapPlan } from '@ltw/domain';

import { imageDigest } from '../images/manifest.ts';
import { materializeCampaign } from '../packages/compiler.ts';
import type { WorkshopDependencies } from '../service.ts';
import {
  initialScenarioDigest,
  initialQuestDigest,
  activationPlanDigest,
  activationReviewDigest,
} from './digests.ts';
import { validateIsolatedBootstrap } from './dry-run.ts';
import { activationPictures } from './review-assets.ts';
import type { ActivationScope, FrozenCampaignActivation } from './store.ts';

export function activationFindings(
  findings: readonly CampaignFinding[],
): CampaignActivationFinding[] {
  const unique = new Map<string, CampaignActivationFinding>();
  for (const finding of findings) {
    const findingId = imageDigest({ version: 1, ...finding });
    unique.set(findingId, { findingId, ...finding });
  }
  return [...unique.values()].sort((a, b) =>
    a.findingId < b.findingId ? -1 : a.findingId > b.findingId ? 1 : 0,
  );
}
export async function loadCampaignActivationReview(
  deps: WorkshopDependencies,
  scope: ActivationScope,
  options: { readonly revision?: number | undefined; readonly textOnly: boolean },
): Promise<{
  readonly review: CampaignActivationReview;
  readonly frozen: FrozenCampaignActivation | null;
} | null> {
  const { packages, images, revisionControls, activation } = deps;
  if (!packages || !images || !revisionControls || !activation) return null;
  const head = await packages.latest(scope.ownerId, scope.draftId);
  if (!head) return null;
  const revision =
    options.revision === undefined || options.revision === head.revision
      ? head
      : await packages.get(scope.ownerId, scope.draftId, options.revision);
  if (!revision) return null;
  const [locks, manifest, existing, materialized] = await Promise.all([
    revisionControls.locks(scope),
    images.repository.manifest(scope, revision.revision),
    activation.repository.status(scope),
    materializeCampaign(revision, scope.ownerId),
  ]);
  if (!locks || !manifest) return null;
  const pictures = await activationPictures(
    scope,
    revision,
    manifest,
    images.repository,
    options.textOnly,
  );
  const plan = buildCampaignBootstrapPlan(
    revision.content,
    revision.identities,
    pictures.assets,
    options.textOnly ? 'TEXT_ONLY' : 'CHOSEN',
  );
  const findings: CampaignFinding[] = [
    ...materialized.assessment.findings,
    ...pictures.findings,
    ...plan.findings,
  ];
  if (revision.revision !== head.revision)
    findings.push({
      severity: 'error',
      code: 'ACTIVATION_HISTORICAL_REVISION',
      path: 'revision',
      message: 'Restore this historical content as a new revision before activating it.',
    });
  if (existing)
    findings.push({
      severity: 'info',
      code: 'ACTIVATION_ALREADY_CONFIRMED',
      path: 'revision',
      message:
        'This draft already has a confirmed activation. Later draft edits do not replace that campaign.',
    });
  if (activationFindings(findings).length > 499 || manifest.entries.length > 1000)
    findings.push({
      severity: 'error',
      code: 'BOOTSTRAP_FINDINGS_LIMIT',
      path: 'content',
      message: 'This campaign has more findings than one bounded confirmation can acknowledge.',
    });
  let tagged = activationFindings(findings);
  const candidate: FrozenCampaignActivation = {
    revision,
    manifest,
    lockVersion: locks.version,
    lockDigest: locks.digest,
    scenarioDigest: initialScenarioDigest(revision),
    questDigest: initialQuestDigest(plan.quests),
    planDigest: '',
    reviewDigest: '',
    textOnly: options.textOnly,
    readiness: 'READY',
    findingIds: tagged.map((finding) => finding.findingId),
    requiredFindingIds: tagged
      .filter((finding) => finding.severity === 'warning')
      .map((finding) => finding.findingId),
    acknowledgedFindingIds: tagged
      .filter((finding) => finding.severity === 'warning')
      .map((finding) => finding.findingId),
    assets: plan.assets,
    quests: plan.quests,
  };
  const withPlan = { ...candidate, planDigest: activationPlanDigest(candidate) };
  let frozen: FrozenCampaignActivation = {
    ...withPlan,
    reviewDigest: activationReviewDigest(scope, withPlan),
  };
  const initiallyReady =
    materialized.assessment.readiness === 'READY' &&
    !plan.incomplete &&
    !tagged.some((finding) => finding.severity === 'error');
  if (initiallyReady && !existing) {
    const bootstrapFindings = await validateIsolatedBootstrap(scope.ownerId, frozen);
    if (bootstrapFindings.length) {
      tagged = activationFindings([...findings, ...bootstrapFindings]);
      const changed = { ...frozen, findingIds: tagged.map((finding) => finding.findingId) };
      frozen = { ...changed, reviewDigest: activationReviewDigest(scope, changed) };
    }
  }
  const confirmable =
    initiallyReady && !existing && !tagged.some((finding) => finding.severity === 'error');
  return {
    frozen: confirmable ? frozen : null,
    review: {
      draftId: scope.draftId,
      revision: revision.revision,
      title: revision.content.world.name,
      language: revision.content.world.language,
      packageDigest: revision.digest,
      planDigest: frozen.planDigest,
      scenarioDigest: frozen.scenarioDigest,
      questDigest: frozen.questDigest,
      manifestVersion: manifest.version,
      manifestDigest: manifest.digest,
      lockVersion: locks.version,
      lockDigest: locks.digest,
      textOnly: options.textOnly,
      reviewDigest: frozen.reviewDigest,
      readiness: materialized.assessment.readiness,
      findings: tagged,
      visuals: pictures.visuals,
      confirmable,
      activation: existing,
    },
  };
}
