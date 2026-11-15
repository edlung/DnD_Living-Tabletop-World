import type {
  CampaignPackage,
  KernelCommand,
  PerspectiveRequest,
} from '../../packages/contracts/src/index.ts';
import {
  buildCampaignPlan,
  InMemoryEventStore,
  resolvePerspective,
  visibleRecords,
} from '../../packages/domain/src/index.ts';
import { isolatedCampaignEngine } from '../../apps/server/src/workshop/packages/isolation.ts';
import { assessmentRevision, ASSESSMENT_OWNER } from './validate.ts';

/** In-memory ordinary World Engine commands only; no activation, HTTP service or database. */
export async function playFixture(content: CampaignPackage) {
  const revision = assessmentRevision(content);
  const engine = isolatedCampaignEngine(new InMemoryEventStore(), revision.createdAt, 72001);
  const campaignId = revision.draftId;
  const dm = { actorId: ASSESSMENT_OWNER, kind: 'user' as const };
  const player = { actorId: 'mixed-local-player', kind: 'user' as const };
  let sequence = 0;
  const execute = (command: KernelCommand, actor = dm) =>
    engine.execute({
      campaignId,
      commandId: `mixed:${sequence++}`,
      actor,
      command,
    });
  const id = (key: string) => {
    const value = revision.identities.entities[key];
    if (!value) throw new Error(`Missing entity ${key}`);
    return value;
  };
  const created = await execute({
    type: 'CreateCampaign',
    name: content.world.name,
    worldName: content.world.worldName,
    language: 'ru',
    startsAt: content.world.startsAt,
  });
  if (created.status !== 'accepted') throw new Error('Could not create isolated play fixture');
  const plan = buildCampaignPlan(content, revision.identities);
  if (plan.findings.some((f) => f.severity === 'error')) throw new Error('Invalid local play plan');
  for (const command of plan.commands) {
    const result = await execute(command);
    if (result.status === 'rejected' && result.code !== 'NO_EFFECT')
      throw new Error(JSON.stringify(result));
  }
  const hero = content.party[0];
  if (!hero) throw new Error('No hero in package');
  const assigned = await execute({
    type: 'AssignCharacter',
    characterId: id(hero),
    playerActorId: player.actorId,
  });
  if (assigned.status !== 'accepted') throw new Error('Local player assignment failed');
  const snapshot = async () => {
    const value = await engine.load(campaignId);
    if (!value) throw new Error('Missing isolated state');
    return value;
  };
  const knowledge = async (request: PerspectiveRequest, actor = dm) => {
    const { state } = await snapshot();
    const access = resolvePerspective(state, actor, request);
    if (!access.ok) throw new Error(`Perspective ${access.reason}`);
    return visibleRecords(state, access.perspective);
  };
  return { engine, campaignId, dm, player, hero, revision, execute, id, snapshot, knowledge };
}
