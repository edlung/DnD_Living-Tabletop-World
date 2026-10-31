import type { CampaignRevision, QuestDefinition } from '@ltw/contracts';
import { buildCampaignBootstrapPlan } from '@ltw/domain';

import { imageDigest, manifestDigest } from '../images/manifest.ts';
import { campaignContentDigest } from '../packages/content.ts';
import type { ActivationScope, FrozenCampaignActivation } from './store.ts';

export const initialScenarioDigest = (revision: CampaignRevision): string => imageDigest(revision);
export const initialQuestDigest = (quests: readonly QuestDefinition[]): string =>
  imageDigest(quests);
export function activationPlanDigest(
  frozen: Pick<
    FrozenCampaignActivation,
    'revision' | 'assets' | 'textOnly' | 'scenarioDigest' | 'questDigest'
  >,
): string {
  const mode = frozen.textOnly ? 'TEXT_ONLY' : 'CHOSEN';
  const plan = buildCampaignBootstrapPlan(
    frozen.revision.content,
    frozen.revision.identities,
    frozen.assets,
    mode,
  );
  return imageDigest({
    version: 1,
    packageDigest: frozen.revision.digest,
    commands: plan.commands,
    preparedParty: plan.preparedParty,
    quests: plan.quests,
    assets: plan.assets,
    scenarioDigest: frozen.scenarioDigest,
    questDigest: frozen.questDigest,
    visualMode: mode,
  });
}
export function activationReviewDigest(
  scope: ActivationScope,
  frozen: Pick<
    FrozenCampaignActivation,
    | 'revision'
    | 'manifest'
    | 'lockVersion'
    | 'lockDigest'
    | 'planDigest'
    | 'scenarioDigest'
    | 'questDigest'
    | 'textOnly'
    | 'findingIds'
    | 'requiredFindingIds'
  >,
): string {
  return imageDigest({
    version: 1,
    ownerId: scope.ownerId,
    draftId: scope.draftId,
    revision: frozen.revision.revision,
    packageDigest: frozen.revision.digest,
    planDigest: frozen.planDigest,
    scenarioDigest: frozen.scenarioDigest,
    questDigest: frozen.questDigest,
    manifestVersion: frozen.manifest.version,
    manifestDigest: frozen.manifest.digest,
    lockVersion: frozen.lockVersion,
    lockDigest: frozen.lockDigest,
    textOnly: frozen.textOnly,
    findingIds: [...frozen.findingIds].sort(),
    requiredFindingIds: [...frozen.requiredFindingIds].sort(),
  });
}
export function frozenActivationDigestsValid(
  scope: ActivationScope,
  frozen: FrozenCampaignActivation,
): boolean {
  const revision = frozen.revision;
  const plan = buildCampaignBootstrapPlan(
    revision.content,
    revision.identities,
    frozen.assets,
    frozen.textOnly ? 'TEXT_ONLY' : 'CHOSEN',
  );
  return (
    revision.draftId === scope.draftId &&
    !plan.incomplete &&
    !plan.findings.some((finding) => finding.severity === 'error') &&
    revision.digest === campaignContentDigest(revision.content, revision.identities) &&
    frozen.scenarioDigest === initialScenarioDigest(revision) &&
    frozen.questDigest === initialQuestDigest(plan.quests) &&
    imageDigest(frozen.quests) === imageDigest(plan.quests) &&
    imageDigest(frozen.assets) === imageDigest(plan.assets) &&
    frozen.manifest.revision === revision.revision &&
    frozen.manifest.packageDigest === revision.digest &&
    frozen.manifest.digest === manifestDigest(frozen.manifest) &&
    frozen.planDigest === activationPlanDigest(frozen) &&
    frozen.reviewDigest === activationReviewDigest(scope, frozen) &&
    imageDigest([...new Set(frozen.acknowledgedFindingIds)].sort()) ===
      imageDigest([...new Set(frozen.requiredFindingIds)].sort())
  );
}
