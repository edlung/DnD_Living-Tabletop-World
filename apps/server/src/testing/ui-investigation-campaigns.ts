import {
  commandSubmissionSchema,
  submissionsFromScript,
  type CommandSubmission,
  type WorldEngine,
} from '@ltw/domain';

import campaigns from '../../../../tests/e2e/fixtures/investigation-campaigns.json' with { type: 'json' };
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';

/**
 * Every mutating browser journey owns a fresh campaign for the server lifetime.
 * Replays of the same test start a new server. No reset route, synthetic HTTP
 * response, or direct canonical-state write is involved.
 */
export async function seedUiInvestigationCampaigns(engine: WorldEngine): Promise<void> {
  const seed = await loadRavenfordSeed();
  for (const campaignId of Object.values(campaigns)) {
    for (const input of seed.submissions) {
      const submission = commandSubmissionSchema.parse(input);
      const command =
        campaignId === campaigns.unknownConcept
          ? beforeLearningAboutCaravan(submission.command)
          : submission.command;
      if (command === null) continue;
      const result = await engine.execute({
        ...submission,
        campaignId,
        commandId: `${campaignId}.${submission.commandId}`,
        command,
      });
      if (result.status !== 'accepted') {
        throw new Error(
          `UI investigation ${campaignId} ${submission.command.type}: ${result.status === 'rejected' ? result.code : result.status}`,
        );
      }
    }
    if (campaignId === campaigns.unknownConcept) await discloseMiraDeparture(engine, campaignId);
  }
}

/**
 * An earlier knowledge state for action-visibility tests: the party has not
 * yet heard the missing-caravan rumor/accounts or lived the seeded memories.
 */
function beforeLearningAboutCaravan(
  command: CommandSubmission['command'],
): CommandSubmission['command'] | null {
  if (
    command.type === 'AddKnowledge' &&
    ['PUBLIC', 'PARTY', 'CHARACTER'].includes(command.scope.kind) &&
    command.subjects?.includes('guild-caravan')
  ) {
    return null;
  }
  if (
    command.type === 'RecordMemory' &&
    ['PUBLIC', 'PARTY', 'CHARACTER'].includes(command.scope.kind)
  ) {
    return null;
  }
  if (
    command.type === 'SetClaim' &&
    command.target.kind === 'knowledge' &&
    command.target.knowledgeId === 'party-mira-departure'
  )
    return null;
  if (command.type === 'AddKnowledge' && command.relations) {
    return {
      ...command,
      relations: command.relations.filter(
        (relation) => relation.knowledgeId !== 'party-goblin-hypothesis',
      ),
    };
  }
  return command;
}

/**
 * Mira guards her account of the departure by default (ADR 0020). This DM
 * disclosure lets the unknown-concept journey reach it once the concept is learned.
 */
async function discloseMiraDeparture(engine: WorldEngine, campaignId: string): Promise<void> {
  for (const submission of submissionsFromScript({
    campaignId,
    actor: { actorId: 'dm-ravenford', kind: 'user' },
    commandIdPrefix: `${campaignId}.disclose-mira-departure`,
    commands: [{ type: 'SetDisclosure', knowledgeId: 'mira-departure', disclosure: 'WILLING' }],
  })) {
    const result = await engine.execute(submission);
    if (result.status !== 'accepted') throw new Error(`UI disclosure ${campaignId} failed`);
  }
}
