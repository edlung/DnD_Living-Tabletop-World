import {
  campaignPackageSchema,
  type CampaignAssessment,
  type CampaignFinding,
  type CampaignRevision,
  type KernelCommand,
} from '@ltw/contracts';
import {
  buildCampaignPlan,
  InMemoryEventStore,
  type CampaignPlan,
  type CampaignSnapshot,
  type WorldEngine,
} from '@ltw/domain';

import { campaignContentDigest } from './content.ts';
import { forkCampaignStore, isolatedCampaignEngine } from './isolation.ts';

export interface CampaignMaterialization {
  readonly assessment: CampaignAssessment;
  readonly snapshot: CampaignSnapshot | null;
  readonly plan: CampaignPlan;
}
const failedPlan = (): CampaignPlan => ({
  commands: [],
  commandPaths: [],
  findings: [],
  quests: [],
  incomplete: false,
});

/** No database, provider, real campaign engine or externally supplied store is reachable here. */
export async function materializeCampaign(
  revision: CampaignRevision,
  ownerId: string,
): Promise<CampaignMaterialization> {
  const findings: CampaignFinding[] = [];
  const parsed = campaignPackageSchema.safeParse(revision.content);
  const finish = (
    plan: CampaignPlan,
    snapshot: CampaignSnapshot | null,
  ): CampaignMaterialization => ({
    plan,
    snapshot,
    assessment: {
      compilerVersion: 1,
      readiness: findings.some((finding) => finding.severity === 'error')
        ? 'INVALID'
        : plan.incomplete
          ? 'INCOMPLETE'
          : 'READY',
      findings,
      counts: {
        entities: parsed.success ? parsed.data.entities.length : 0,
        knowledge: parsed.success ? parsed.data.knowledge.length : 0,
        encounters: parsed.success ? parsed.data.encounters.length : 0,
        quests: parsed.success ? parsed.data.quests.length : 0,
      },
    },
  });
  if (!parsed.success) {
    findings.push({
      severity: 'error',
      code: 'PACKAGE_SCHEMA',
      path: 'content',
      message: 'Campaign content has an unsupported shape or version',
    });
    return finish(failedPlan(), null);
  }
  if (revision.digest !== campaignContentDigest(parsed.data, revision.identities)) {
    findings.push({
      severity: 'error',
      code: 'PACKAGE_DIGEST',
      path: 'digest',
      message: 'The stored campaign revision does not match its digest',
    });
    return finish(failedPlan(), null);
  }
  const content = parsed.data;
  const plan = buildCampaignPlan(content, revision.identities);
  findings.push(...plan.findings);
  if (findings.some((finding) => finding.severity === 'error')) return finish(plan, null);
  const store = new InMemoryEventStore();
  const engine = isolatedCampaignEngine(store, revision.createdAt, 62000);
  let sequence = 0;
  const execute = async (target: WorldEngine, command: KernelCommand, path: string) => {
    const result = await target.execute({
      campaignId: revision.draftId,
      commandId: `package:${revision.draftId}:${revision.revision}:${sequence++}`,
      actor: { actorId: ownerId, kind: 'user' },
      command,
    });
    if (result.status === 'rejected') {
      if (result.code === 'NO_EFFECT') return 'unchanged';
      findings.push({ severity: 'error', code: result.code, path, message: result.message });
      return 'rejected';
    }
    return 'applied';
  };
  if (
    (await execute(
      engine,
      {
        type: 'CreateCampaign',
        name: content.world.name,
        worldName: content.world.worldName,
        language: content.world.language,
        startsAt: content.world.startsAt,
      },
      'world',
    )) === 'rejected'
  )
    return finish(plan, null);
  const commands: KernelCommand[] = [];
  const commandPaths: string[] = [];
  for (let index = 0; index < plan.commands.length; index++) {
    const command = plan.commands[index];
    if (!command) continue;
    const path = plan.commandPaths[index] ?? 'content';
    const outcome = await execute(engine, command, path);
    if (outcome === 'rejected') return finish(plan, null);
    if (outcome === 'applied') {
      commands.push(command);
      commandPaths.push(path);
    }
  }
  const effectivePlan: CampaignPlan = { ...plan, commands, commandPaths };
  const snapshot = await engine.load(revision.draftId);
  if (!snapshot) throw new Error('CAMPAIGN_MATERIALIZATION_UNAVAILABLE');

  // A prepared fight is tested on its own branch, without creating played facts.
  for (let index = 0; index < content.encounters.length; index++) {
    const encounter = content.encounters[index];
    if (!encounter) continue;
    const path = `encounters.${encounter.key}`;
    const branchStore = await forkCampaignStore(store, revision.draftId, snapshot);
    const branch = isolatedCampaignEngine(branchStore, revision.createdAt, 63000 + index);
    let valid = true;
    const locationId = revision.identities.entities[encounter.location] ?? '';
    for (const participant of encounter.combatants) {
      if (
        (await execute(
          branch,
          {
            type: 'PlaceEntity',
            entityId: revision.identities.entities[participant.entity] ?? '',
            locationId,
          },
          path,
        )) === 'rejected'
      ) {
        valid = false;
        break;
      }
    }
    if (valid)
      await execute(
        branch,
        {
          type: 'StartCombat',
          encounterId: revision.identities.encounters[encounter.key] ?? '',
          locationId,
          battlefield: encounter.battlefield,
          combatants: encounter.combatants.map((participant) => ({
            entityId: revision.identities.entities[participant.entity] ?? '',
            side: participant.side,
            position: participant.position,
          })),
        },
        path,
      );
  }
  return finish(effectivePlan, snapshot);
}

export async function assessCampaignRevision(
  revision: CampaignRevision,
  ownerId: string,
): Promise<CampaignAssessment> {
  return (await materializeCampaign(revision, ownerId)).assessment;
}
