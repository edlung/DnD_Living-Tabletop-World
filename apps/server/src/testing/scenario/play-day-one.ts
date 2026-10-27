import type {
  AuthoringProposalResponse,
  DmIntentResponse,
  EntityContextResponse,
  KnowledgeListResponse,
  NpcDialogueResponse,
  ProposableCommand,
} from '@ltw/contracts';

import { BASE, type RavenfordSession, type Reply } from './session.ts';

/**
 * Test support: Ravenford's Day 1 in town and at the caravan site
 * (RAVENFORD_SPEC.md, Scenario), up to the DM authoring Tomas Reed. Each
 * step goes through a public route as the persona who would take it, and
 * throws when the route refuses what the scenario needs.
 */
export { EN_SCRIPT } from './script.ts';

export function ok(reply: Reply, expected = 200): Reply {
  if (reply.status !== expected)
    throw new Error(`expected ${String(expected)}, got ${String(reply.status)}: ${reply.raw}`);
  return reply;
}

const dialogue = (
  session: RavenfordSession,
  npcId: string,
  intent: Record<string, unknown>,
  line?: string,
) =>
  session.post('player', `${BASE}/npcs/${npcId}/dialogue`, {
    characterId: 'elowen-starwhisper',
    intent,
    ...(line ? { line } : {}),
  });

export const contextOf = async (session: RavenfordSession, entityId: string) =>
  ok(
    await session.get('player', `${BASE}/entities/${entityId}/context?perspective=PLAYER`),
  ).json<EntityContextResponse>();

export const partyKnowledge = async (session: RavenfordSession) =>
  ok(
    await session.get('player', `${BASE}/knowledge?perspective=PARTY`),
  ).json<KnowledgeListResponse>().knowledge;

export interface DayOne {
  readonly miraContext: EntityContextResponse;
  readonly talk: NpcDialogueResponse;
  readonly askMira: NpcDialogueResponse;
  readonly symbolContext: EntityContextResponse;
  readonly examined: number;
  readonly showOrin: NpcDialogueResponse;
  readonly askOrin: NpcDialogueResponse;
  readonly insightOrin: NpcDialogueResponse;
  readonly askThorne: NpcDialogueResponse;
  readonly proposal: AuthoringProposalResponse;
  readonly commit: Reply;
  /** Tomas's ID: the server's, not the model's (ADR 0008, Gate 06 remediation). */
  readonly tomasId: string;
  readonly tomasContext: EntityContextResponse;
  readonly askTomas: NpcDialogueResponse;
  readonly performed: NpcDialogueResponse;
}

export async function playDayOne(session: RavenfordSession): Promise<DayOne> {
  // Arrival: the Market Square, Mira, and the missing caravan (Day 1 10:00).
  session.phase('arrival');
  ok(await session.get('player', `${BASE}/locations/market-square/scene?perspective=PLAYER`));
  const miraContext = await contextOf(session, 'mira-vale');
  const talk = ok(
    await dialogue(session, 'mira-vale', { kind: 'talk' }, session.script.talkLine),
  ).json<NpcDialogueResponse>();
  const askMira = ok(
    await dialogue(session, 'mira-vale', { kind: 'ask', topicId: 'guild-caravan' }),
  ).json<NpcDialogueResponse>();

  // The caravan site: every piece of evidence, by Rules-resolved checks.
  session.phase('investigation');
  await session.dm({ type: 'AdvanceWorldTime', by: 3_600 });
  await session.act({ type: 'EnterLocation', locationId: 'old-trade-road' });
  await session.act({ type: 'EnterLocation', locationId: 'location-f3b82c8b' });
  const symbolContext = await contextOf(session, 'feature-19c7c7f7');
  const examinations: [string, string][] = [
    ['location-f3b82c8b', 'inspect'],
    ['feature-19c7c7f7', 'inspect'],
    ['feature-19c7c7f7', 'investigation'],
    ['item-f44e7183', 'inspect'],
    ['item-f44e7183', 'investigation'],
    ['item-0869f47a', 'inspect'],
    ['item-0869f47a', 'investigation'],
    ['feature-ccec7e50', 'perception'],
    ['item-08851105', 'inspect'],
    ['item-08851105', 'investigation'],
  ];
  for (const [entityId, method] of examinations) {
    await session.act({ type: 'ExamineEntity', entityId, method });
  }
  await session.act({
    type: 'FormHypothesis',
    scope: 'PARTY',
    statement: session.script.hypothesis,
    subjects: ['guild-caravan'],
  });

  // Orin: the symbol shown, his account, a read of him.
  session.phase('orin');
  await session.dm({ type: 'AdvanceWorldTime', by: 3_600 });
  await session.act({ type: 'EnterLocation', locationId: 'orins-alchemy' });
  const symbolEvidence = (await partyKnowledge(session)).find(
    (record) =>
      record.knowledgeType === 'EVIDENCE' &&
      record.subjects.some((s) => s.entityId === 'feature-19c7c7f7'),
  );
  if (!symbolEvidence) throw new Error('the party holds no evidence about the symbol');
  const showOrin = ok(
    await dialogue(session, 'orin-stonebeard', {
      kind: 'show',
      knowledgeId: symbolEvidence.knowledgeId,
    }),
  ).json<NpcDialogueResponse>();
  const askOrin = ok(
    await dialogue(session, 'orin-stonebeard', { kind: 'ask', topicId: 'feature-19c7c7f7' }),
  ).json<NpcDialogueResponse>();
  const insightOrin = ok(
    await dialogue(session, 'orin-stonebeard', { kind: 'insight', topicId: 'feature-19c7c7f7' }),
  ).json<NpcDialogueResponse>();

  // The North Gate: Thorne's account, against Mira's.
  session.phase('contradiction');
  await session.act({ type: 'EnterLocation', locationId: 'north-gate' });
  const askThorne = ok(
    await dialogue(session, 'captain-thorne', { kind: 'ask', topicId: 'guild-caravan' }),
  ).json<NpcDialogueResponse>();

  // The DM authors Tomas in natural language, edits, confirms, and performs him.
  session.phase('authoring');
  const intent = ok(
    await session.post('dm', `${BASE}/ai/intents`, { text: session.script.tomasRequest }),
  ).json<DmIntentResponse>();
  const proposals = `${BASE}/authoring/proposals`;
  const first = ok(
    await session.post('dm', proposals, { traceId: intent.traceId }),
    201,
  ).json<AuthoringProposalResponse>();
  const at = `${proposals}/${first.proposal.proposalId}`;
  const proposal = ok(
    await session.post('dm', `${at}/revisions`, {
      basedOnRevision: 1,
      commands: edited(first.proposal.commands, session.script.tomasEdited),
    }),
    201,
  ).json<AuthoringProposalResponse>();
  const commit = ok(
    await session.post('dm', `${at}/commit`, {
      revision: proposal.proposal.revision,
      confirmation: proposal.preview?.confirmation,
    }),
  );
  await session.runAssetWorker();
  const tomasId = createdEntityId(proposal.proposal.commands);
  const tomasImage = ok(await session.get('dm', `${BASE}/assets`))
    .json<{ assets: { assetId: string; entityId: string; status: string }[] }>()
    .assets.find((asset) => asset.entityId === tomasId && asset.status === 'CANDIDATE');
  if (!tomasImage) throw new Error('no candidate image of Tomas');
  await session.dm({ type: 'ApproveAsset', assetId: tomasImage.assetId });
  // The DM refines him after the commit, as for any NPC.
  await session.dm({
    type: 'UpdateEntityProfile',
    entityId: tomasId,
    description: session.script.tomasRefined,
  });
  const tomasContext = await contextOf(session, tomasId);
  const askTomas = ok(
    await dialogue(session, tomasId, { kind: 'ask', topicId: 'guild-caravan' }),
  ).json<NpcDialogueResponse>();
  // The DM switches to the party's view, then performs Tomas for Elowen.
  ok(await session.get('dm', `${BASE}/knowledge?perspective=PARTY`));
  const performed = ok(
    await session.post('dm', `${BASE}/npcs/${tomasId}/dialogue`, {
      characterId: 'elowen-starwhisper',
      intent: { kind: 'talk' },
    }),
  ).json<NpcDialogueResponse>();
  return {
    miraContext,
    talk,
    askMira,
    symbolContext,
    examined: examinations.length,
    showOrin,
    askOrin,
    insightOrin,
    askThorne,
    proposal,
    commit,
    tomasId,
    tomasContext,
    askTomas,
    performed,
  };
}

/** The entity a proposal creates: its ID is fixed when the revision is stored. */
export function createdEntityId(commands: readonly ProposableCommand[]): string {
  const created = commands.find((command) => command.type === 'CreateEntity');
  if (created?.type !== 'CreateEntity' || created.entityId === undefined) {
    throw new Error('the stored revision creates no entity with a resolved ID');
  }
  return created.entityId;
}

/** The DM's edit: Tomas's age and role, and his willingness to tell what he saw. */
function edited(commands: readonly ProposableCommand[], description: string): ProposableCommand[] {
  const record = commands.find((command) => command.type === 'AddKnowledge');
  if (record?.type !== 'AddKnowledge' || record.knowledgeId === undefined) {
    throw new Error('the stored revision has a resolved record ID');
  }
  return [
    ...commands.map((command) =>
      command.type === 'CreateEntity' ? { ...command, description } : command,
    ),
    { type: 'SetDisclosure', knowledgeId: record.knowledgeId, disclosure: 'WILLING' },
  ];
}
