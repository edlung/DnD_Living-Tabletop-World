import { createCombatEngine } from '@ltw/combat';
import type {
  EntityAssetsResponse,
  EncounterResponse,
  EntityPresentationResponse,
  KnowledgeListResponse,
  MemoryRecallResponse,
  QuestListResponse,
} from '@ltw/contracts';
import {
  checkWorldIntegrity,
  parseRecordedEvent,
  redecideEffective,
  replay,
  undoneBeneathEarlierWriters,
} from '@ltw/domain';
import { skillModifier } from '@ltw/rules';
import { afterEach, describe, expect, it } from 'vitest';

import { contentHashOf } from '../assets/content-store.ts';
import { campaignPlayFixture, type CampaignPlayFixture } from '../testing/campaign-play/fixture.ts';
import { investigateBell, playPreparedCombat } from '../testing/campaign-play/journey.ts';
import { stateDigest } from '../world-engine/state-digest.ts';

const opened: CampaignPlayFixture[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((f) => f.close()));
});
async function open(pictures = true) {
  const f = await campaignPlayFixture(pictures);
  opened.push(f);
  return f;
}

describe('offline owner-specimen campaign after confirmed bootstrap', () => {
  it('plays investigation, eligible social disclosure and the actual prepared encounter through normal invited-player HTTP', async () => {
    const f = await open();
    expect(f.initial.state.roster.size).toBe(0);
    expect(f.initial.state.preparedParty?.size).toBe(3);
    expect(
      f.initial.history.every((event) => event.causation.commandType === 'BootstrapCampaign'),
    ).toBe(true);
    expect(
      f.initial.history.some((event) =>
        [
          'CombatStarted',
          'CombatEnded',
          'MemoryRecorded',
          'AttackPerformed',
          'EvidenceExamined',
          'InformationShared',
        ].includes(event.type),
      ),
    ).toBe(false);
    const invited = await f.snapshot();
    expect(invited.state.roster.size).toBe(1);
    expect(invited.state.roster.get(f.id('alena'))).toMatch(/^player:/);
    expect(invited.history.at(-1)).toMatchObject({
      type: 'CharacterAssigned',
      causation: {
        commandId: `invite:${f.invitation.invitationId}`,
        actor: { kind: 'system', actorId: 'sign-in' },
      },
    });
    const initialKnowledge = await f.send('player', 'GET', '/knowledge?perspective=PLAYER');
    expect(initialKnowledge.statusCode).toBe(200);
    expect(
      initialKnowledge
        .json<KnowledgeListResponse>()
        .knowledge.every((record) => !('origin' in record) && !('claim' in record)),
    ).toBe(true);
    const initialQuest = await f.send('player', 'GET', '/quests?perspective=PLAYER');
    expect(
      initialQuest
        .json<QuestListResponse>()
        .quests[0]?.transitions.map((transition) => transition.stage),
    ).toEqual(['activated']);
    const adopted = f.activationRecord.frozen.assets[0];
    if (!adopted) throw new Error('TEST_ADOPTED_PICTURE');
    const bytesBefore = await f.send(
      'player',
      'GET',
      `/assets/content/${adopted.contentHash}?perspective=PLAYER`,
    );
    expect(bytesBefore.statusCode).toBe(200);
    expect(contentHashOf(bytesBefore.rawPayload)).toBe(adopted.contentHash);
    const safeAssets = await f.send(
      'player',
      'GET',
      `/entities/${f.id('arden')}/assets?perspective=PLAYER`,
    );
    expect(safeAssets.json<EntityAssetsResponse>().assets[0]).toEqual({
      variant: 'reference',
      purpose: 'image',
      contentHash: adopted.contentHash,
      mediaType: adopted.mediaType,
    });
    const investigation = await investigateBell(f);
    for (const outcome of [investigation.inspected, investigation.journal])
      expect(outcome).toMatchObject({
        status: 'accepted',
        events: [],
        outcome: { kind: 'ExamineEntity' },
      });
    for (const result of [investigation.rumor, investigation.testimony]) {
      expect(result).toMatchObject({ status: 'accepted', events: [] });
      if (result.status === 'rejected' || result.outcome?.kind !== 'AskAbout')
        throw new Error('TEST_EXPECTED_SOCIAL_DISCLOSURE');
      expect(result.outcome.shared).toHaveLength(1);
    }
    expect(investigation.guarded).toMatchObject({ status: 'rejected', code: 'NO_EFFECT' });
    const learned = await f.send('player', 'GET', '/knowledge?perspective=PLAYER');
    const records = learned.json<KnowledgeListResponse>().knowledge;
    expect(
      records.some(
        (record) => record.knowledgeType === 'EVIDENCE' && record.scope.kind === 'PARTY',
      ),
    ).toBe(true);
    expect(
      records.some(
        (record) =>
          record.knowledgeType === 'RUMOR' && record.attributedTo?.entityId === f.id('arden'),
      ),
    ).toBe(true);
    expect(
      records.some(
        (record) =>
          record.knowledgeType === 'TESTIMONY' && record.attributedTo?.entityId === f.id('iva'),
      ),
    ).toBe(true);
    expect(records.some((record) => record.scope.kind === 'WORLD_TRUTH')).toBe(false);
    const quest = await f.send('player', 'GET', '/quests?perspective=PLAYER');
    expect(
      quest.json<QuestListResponse>().quests[0]?.transitions.map((transition) => transition.stage),
    ).toEqual(['activated', 'find-sluice', 'read-journal']);
    const combat = await playPreparedCombat(f);
    expect(combat.playerEncounter.statusCode).toBe(200);
    const encounter = combat.playerEncounter.json<EncounterResponse>().encounter;
    expect(encounter?.currentCombatantId).toBe(f.id('alena'));
    expect(
      encounter?.combatants.find((combatant) => combatant.entity.entityId === f.id('ice-crab')),
    ).not.toHaveProperty('hitPoints');
    expect(encounter?.combatants.every((combatant) => !('initiative' in combatant))).toBe(true);
    expect(combat.arrow).toMatchObject({
      status: 'accepted',
      events: [],
      outcome: { kind: 'Attack', hit: true, damage: 7 },
    });
    const hp = (snapshot: typeof combat.beforeClaw) =>
      snapshot.state.characterSheets.get(f.id('alena'))?.hitPoints.current;
    expect(hp(combat.afterClaw)).toBe((hp(combat.beforeClaw) ?? 0) - 5);
    expect(hp(combat.afterUndo)).toBe(hp(combat.beforeClaw));
    expect(combat.undone.status).toBe('accepted');
    expect(combat.replayedClaw).toMatchObject({
      status: 'accepted',
      outcome: { kind: 'Attack', hit: true, damage: 5 },
    });
    await f.act({ type: 'EnterLocation', locationId: f.id('dock') });
    const completed = await f.send('player', 'GET', '/quests?perspective=PLAYER');
    expect(
      completed
        .json<QuestListResponse>()
        .quests[0]?.transitions.map((transition) => transition.stage),
    ).toEqual(['activated', 'find-sluice', 'read-journal', 'return-harbor']);
    const journal = await f.send('player', 'GET', '/memories?perspective=PLAYER');
    expect(journal.statusCode).toBe(200);
    expect(journal.json<MemoryRecallResponse>().memories.length).toBeGreaterThan(0);
    expect((await f.send('player', 'GET', '/dm/history?perspective=DM')).statusCode).toBe(404);
    const dmHistory = await f.send('dm', 'GET', '/dm/history?perspective=DM');
    expect(dmHistory.statusCode).toBe(200);
    const snapshot = await f.snapshot(),
      log = await f.engine.commandLog(f.campaignId);
    expect(log.filter((command) => command.commandType === 'BootstrapCampaign')).toHaveLength(1);
    expect(snapshot.history.filter((event) => event.type === 'CombatStarted')).toHaveLength(1);
    expect(snapshot.history.filter((event) => event.type === 'CombatEnded')).toHaveLength(1);
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    expect(undoneBeneathEarlierWriters(snapshot.state, snapshot.history)).toEqual([]);
    expect(redecideEffective(log, snapshot, skillModifier, createCombatEngine())).toBeNull();
    const replayed = replay(
      snapshot.history.map((event) => parseRecordedEvent(JSON.parse(JSON.stringify(event)))),
    );
    expect(replayed).toEqual(snapshot.state);
    expect(stateDigest(replayed)).toBe(stateDigest(snapshot.state));
    expect(await f.content.get(f.campaignId)).toEqual(f.initialContent);
    expect(await f.revisions.latest(f.ownerId, f.draftId)).toEqual(f.revision);
    expect(snapshot.state.bootstrap).toEqual(f.initial.state.bootstrap);
    expect([...snapshot.state.assets.assets.values()]).toEqual([
      ...f.initial.state.assets.assets.values(),
    ]);
    const bytesAfter = await f.send(
      'player',
      'GET',
      `/assets/content/${adopted.contentHash}?perspective=PLAYER`,
    );
    expect(bytesAfter.rawPayload).toEqual(bytesBefore.rawPayload);
    const forbidden = f.revision.content.knowledge
      .filter((record) => record.scope.kind === 'WORLD_TRUTH' || record.key === 'iva-confession')
      .map((record) => record.statement);
    forbidden.push(
      ...f.revision.content.laterOutline,
      ...f.revision.content.encounters.map((encounter) => encounter.trigger),
      ...f.activationRecord.frozen.assets.flatMap((asset) => [
        asset.origin.candidateId,
        asset.origin.jobId,
        asset.origin.sourceSignature,
      ]),
    );
    for (const exchange of f.exchanges.filter((exchange) => exchange.persona === 'player'))
      for (const marker of forbidden)
        expect(exchange.body, `${exchange.path} leaked ${marker}`).not.toContain(marker);
    expect(f.ai.traces.all()).toEqual([]);
  });
  it('keeps text-only play neutral and rejects another prepared seat or private scope without recording actions', async () => {
    const f = await open(false),
      before = await f.snapshot();
    expect(f.initial.state.bootstrap?.visualMode).toBe('TEXT_ONLY');
    expect(f.initial.state.assets.assets.size).toBe(0);
    expect(f.initial.state.assets.requests.size).toBe(0);
    expect(f.initial.state.assets.jobs.size).toBe(0);
    expect(f.initialContent.assets).toEqual([]);
    const presentation = await f.send(
      'player',
      'GET',
      `/entities/${f.id('arden')}/presentation?perspective=PLAYER`,
    );
    expect(presentation.statusCode).toBe(200);
    expect(presentation.json<EntityPresentationResponse>().presentation).toMatchObject({
      observed: true,
      image: null,
      figure: null,
      battleMap: null,
    });
    const forged = await f.send('player', 'POST', '/commands', {
      commandId: 'another-seat',
      command: { type: 'EnterLocation', characterId: f.id('borin'), locationId: f.id('archive') },
    });
    expect(forged.statusCode).toBe(403);
    expect(
      (await f.send('player', 'GET', `/knowledge?perspective=NPC:${f.id('iva')}`)).statusCode,
    ).toBe(403);
    const truth = f.revision.identities.knowledge['device-truth'];
    if (!truth) throw new Error('TEST_WORLD_TRUTH');
    expect(
      (await f.send('player', 'GET', `/knowledge/${truth}?perspective=PLAYER`)).statusCode,
    ).toBe(404);
    expect(
      (await f.send('player', 'GET', '/knowledge/never-existed?perspective=PLAYER')).statusCode,
    ).toBe(404);
    const bypass = await f.send('dm', 'POST', '/commands', {
      commandId: 'bootstrap-bypass',
      command: { type: 'BootstrapCampaign' },
    });
    expect(bypass.statusCode).toBe(400);
    expect((await f.snapshot()).history).toEqual(before.history);
    const inspected = await f.act({
      type: 'ExamineEntity',
      entityId: f.id('copper-dust'),
      method: 'inspect',
    });
    expect(inspected).toMatchObject({
      status: 'accepted',
      events: [],
      outcome: { kind: 'ExamineEntity' },
    });
    const snapshot = await f.snapshot();
    expect(snapshot.state.assets.assets.size).toBe(0);
    expect(snapshot.state.roster.size).toBe(1);
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    expect(replay(snapshot.history)).toEqual(snapshot.state);
    expect(await f.content.get(f.campaignId)).toEqual(f.initialContent);
    expect(f.ai.traces.all()).toEqual([]);
  });
});
