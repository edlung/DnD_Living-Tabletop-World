import { OPAQUE_QUEST_ID, OPAQUE_STAGE_ID, kernelCommandSchema } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { buildCampaignPlan } from './plan.ts';
import { bellCampaign } from './testing/bell.ts';
import { testBootstrapIdentities, testCampaignIdentities } from './testing/identities.ts';

describe('campaign initial plan', () => {
  it('compiles a different playable campaign without assigning fake players or starting future events', () => {
    const content = bellCampaign();
    const ids = testCampaignIdentities(content);
    const plan = buildCampaignPlan(content, ids);
    expect(plan.findings).toEqual([]);
    expect(plan.incomplete).toBe(false);
    expect(plan.commands.length).toBeGreaterThan(content.entities.length);
    expect(plan.commandPaths).toHaveLength(plan.commands.length);
    expect(plan.commands.every((command) => kernelCommandSchema.safeParse(command).success)).toBe(
      true,
    );
    expect(plan.commands.at(-1)).toMatchObject({ type: 'StartScene', sceneId: ids.scene });
    expect(
      plan.commands.some((command) =>
        [
          'CreateCampaign',
          'AssignCharacter',
          'StartCombat',
          'RecordMemory',
          'GenerateChronicle',
        ].includes(command.type),
      ),
    ).toBe(false);
    expect(plan.quests[0]?.activation.subject).toMatch(/^[0-9a-f-]{36}$/);
    expect(plan.quests[0]?.activation.subject).not.toBe(content.quests[0]?.activation.subject);
  });

  it('orders location parents and knowledge dependencies deterministically', () => {
    const content = bellCampaign();
    const ids = testCampaignIdentities(content);
    const plan = buildCampaignPlan(content, ids);
    const reversed = structuredClone(content);
    reversed.entities.reverse();
    reversed.knowledge.reverse();
    reversed.relationships.reverse();
    reversed.clues.reverse();
    reversed.quests.reverse();
    expect(buildCampaignPlan(reversed, ids).commands).toEqual(plan.commands);
    const created = plan.commands.filter((command) => command.type === 'CreateEntity');
    for (const entity of content.entities) {
      if (!entity.location?.parent) continue;
      expect(
        created.findIndex(
          (command) => command.entityId === ids.entities[entity.location?.parent ?? ''],
        ),
      ).toBeLessThan(created.findIndex((command) => command.entityId === ids.entities[entity.key]));
    }
  });

  it('reports missing, non-opaque and colliding server mappings without a partial executable plan', () => {
    const content = bellCampaign();
    const ids = testCampaignIdentities(content);
    const key = content.entities[0]?.key ?? '';
    const missingIds = {
      ...ids,
      entities: Object.fromEntries(Object.entries(ids.entities).filter(([entry]) => entry !== key)),
    };
    let plan = buildCampaignPlan(content, missingIds);
    expect(plan.findings.some((finding) => finding.code === 'IDENTITY_MISSING')).toBe(true);
    expect(plan.commands).toEqual([]);
    const invalid = testCampaignIdentities(content);
    (invalid.entities as Record<string, string>)[key] = 'secret-tower';
    plan = buildCampaignPlan(content, invalid);
    expect(plan.findings.some((finding) => finding.code === 'IDENTITY_INVALID')).toBe(true);
    const collision = testCampaignIdentities(content);
    (collision.entities as Record<string, string>)[key] = collision.scene;
    expect(
      buildCampaignPlan(content, collision).findings.some(
        (finding) => finding.code === 'IDENTITY_COLLISION',
      ),
    ).toBe(true);
  });

  it('detects duplicate keys, missing locations and cyclic location topology', () => {
    const content = bellCampaign();
    const first = content.entities[0];
    if (!first) throw new Error('missing fixture entity');
    content.entities.push(structuredClone(first));
    let plan = buildCampaignPlan(content, testCampaignIdentities(content));
    expect(plan.findings.some((finding) => finding.code === 'DUPLICATE_KEY')).toBe(true);
    const missing = bellCampaign();
    const person = missing.entities.find((entity) => entity.kind === 'npc');
    if (!person) throw new Error('missing fixture NPC');
    person.placement = { location: 'not-a-place', since: null };
    plan = buildCampaignPlan(missing, testCampaignIdentities(missing));
    expect(plan.findings.some((finding) => finding.code === 'REFERENCE_MISSING')).toBe(true);
    const cycle = bellCampaign();
    const locations = cycle.entities.filter((entity) => entity.kind === 'location');
    const a = locations[0];
    const b = locations[1];
    if (!a?.location || !b?.location) throw new Error('missing fixture locations');
    a.location.parent = b.key;
    b.location.parent = a.key;
    expect(
      buildCampaignPlan(cycle, testCampaignIdentities(cycle)).findings.some(
        (finding) => finding.code === 'REFERENCE_CYCLE',
      ),
    ).toBe(true);
  });

  it('names quests and stages by their server IDs, never the authored slugs (Gate 07, G07-03)', () => {
    const content = bellCampaign();
    const ids = testCampaignIdentities(content);
    const plan = buildCampaignPlan(content, ids);
    expect(plan.findings).toEqual([]);
    expect(plan.quests).toHaveLength(content.quests.length);
    let returns = 0;
    for (const quest of content.quests) {
      const compiled = plan.quests.find((entry) => entry.questId === ids.quests?.[quest.questId]);
      expect(compiled?.questId).toMatch(OPAQUE_QUEST_ID);
      expect(compiled?.milestones.map((milestone) => milestone.stage)).toEqual(
        quest.milestones.map((milestone) => ids.stages?.[quest.questId]?.[milestone.stage]),
      );
      for (const milestone of compiled?.milestones ?? []) {
        expect(milestone.stage).toMatch(OPAQUE_STAGE_ID);
        if (milestone.kind === 'returned-to') {
          returns += 1;
          expect(compiled?.milestones.map((entry) => entry.stage)).toContain(milestone.after);
        }
      }
    }
    expect(returns).toBeGreaterThan(0);
    const [first] = content.quests;
    if (!first) throw new Error('fixture missing a quest');
    const partial = { ...ids, stages: { ...ids.stages, [first.questId]: {} } };
    expect(
      buildCampaignPlan(content, partial).findings.filter(
        (finding) => finding.code === 'IDENTITY_MISSING',
      ),
    ).toHaveLength(first.milestones.length);
    // Without quest identities (the engine's bootstrap, older revisions) the authored keys stay.
    const legacy = buildCampaignPlan(content, testBootstrapIdentities(content));
    expect(legacy.findings).toEqual([]);
    expect(legacy.quests.map((quest) => quest.questId).sort()).toEqual(
      content.quests.map((quest) => quest.questId).sort(),
    );
  });

  it('preserves truth, rumor, testimony and explicit NPC disclosure without cross-scope holders', () => {
    const content = bellCampaign();
    const ids = testCampaignIdentities(content);
    const plan = buildCampaignPlan(content, ids);
    const knowledge = plan.commands.filter((command) => command.type === 'AddKnowledge');
    expect(knowledge.some((command) => command.scope.kind === 'WORLD_TRUTH')).toBe(true);
    expect(knowledge.some((command) => command.knowledgeType === 'RUMOR')).toBe(true);
    expect(knowledge.some((command) => command.knowledgeType === 'TESTIMONY')).toBe(true);
    for (const record of content.knowledge.filter((record) => record.scope.kind === 'NPC')) {
      expect(plan.commands).toContainEqual({
        type: 'SetDisclosure',
        knowledgeId: ids.knowledge[record.key],
        disclosure: record.disclosure,
      });
    }
    const unstated = bellCampaign();
    const willing = unstated.knowledge.find(
      (entry) => entry.scope.kind === 'NPC' && entry.disclosure === 'WILLING',
    );
    if (!willing) throw new Error('fixture missing a willing NPC record');
    // Gate 07, G07-04: an omitted disclosure keeps the engine's GUARDED default.
    delete willing.disclosure;
    const unstatedIds = testCampaignIdentities(unstated);
    const guarded = buildCampaignPlan(unstated, unstatedIds);
    expect(guarded.findings).toEqual([]);
    expect(
      guarded.commands.some(
        (command) =>
          command.type === 'SetDisclosure' &&
          command.knowledgeId === unstatedIds.knowledge[willing.key],
      ),
    ).toBe(false);
    const malformed = bellCampaign();
    const record = malformed.knowledge.find((record) => record.scope.kind === 'NPC');
    const location = malformed.entities.find((entity) => entity.kind === 'location');
    if (!record || !location) throw new Error('fixture missing scope case');
    record.scope = { kind: 'NPC', holder: location.key };
    expect(
      buildCampaignPlan(malformed, testCampaignIdentities(malformed)).findings.some(
        (finding) => finding.code === 'REFERENCE_KIND',
      ),
    ).toBe(true);
  });

  it('rejects impossible initial knowledge and declaration references instead of materializing them', () => {
    const content = bellCampaign();
    const record = content.knowledge[0];
    if (!record) throw new Error('missing fixture knowledge');
    record.knownSince = content.world.startsAt + 1;
    content.situations[0]?.participants.push('missing-npc');
    const plan = buildCampaignPlan(content, testCampaignIdentities(content));
    expect(plan.findings.some((finding) => finding.code === 'KNOWLEDGE_IN_FUTURE')).toBe(true);
    expect(plan.findings.some((finding) => finding.code === 'REFERENCE_MISSING')).toBe(true);
    expect(plan.commands).toEqual([]);
  });

  it('keeps incomplete drafts inspectable but distinguishes them from valid ready content', () => {
    const content = bellCampaign();
    content.party = [];
    content.world.opening = '';
    content.firstSession = [];
    const plan = buildCampaignPlan(content, testCampaignIdentities(content));
    expect(plan.incomplete).toBe(true);
    expect(plan.findings.some((finding) => finding.code === 'PARTY_INCOMPLETE')).toBe(true);
    expect(plan.findings.some((finding) => finding.severity === 'error')).toBe(false);
  });

  it('rewrites every supported quest milestone reference without pre-completing a quest', () => {
    const content = bellCampaign();
    const location = content.entities.find((entity) => entity.kind === 'location');
    const npc = content.entities.find((entity) => entity.kind === 'npc');
    if (!location || !npc) throw new Error('missing quest fixture entities');
    content.quests = [
      {
        questId: 'all-paths',
        title: 'Все способы узнать',
        activation: { subject: location.key, summary: 'Начало' },
        milestones: [
          { kind: 'reached', stage: 'arrive', locationId: location.key, summary: 'Прибытие' },
          { kind: 'examined-at', stage: 'look', locationId: location.key, summary: 'Осмотр' },
          { kind: 'hypothesized', stage: 'idea', subject: location.key, summary: 'Версия' },
          {
            kind: 'contradiction-found',
            stage: 'conflict',
            subject: location.key,
            summary: 'Расхождение',
          },
          {
            kind: 'told-by',
            stage: 'talk',
            subject: location.key,
            informant: npc.key,
            summary: 'Рассказ',
          },
          { kind: 'survived-fight-at', stage: 'fight', locationId: location.key, summary: 'Бой' },
          {
            kind: 'returned-to',
            stage: 'return',
            locationId: location.key,
            after: 'arrive',
            summary: 'Возвращение',
          },
        ],
      },
    ];
    const ids = testCampaignIdentities(content);
    const plan = buildCampaignPlan(content, ids);
    expect(plan.findings).toEqual([]);
    expect(plan.quests[0]?.activation.subject).toBe(ids.entities[location.key]);
    for (const milestone of plan.quests[0]?.milestones ?? []) {
      if ('locationId' in milestone) expect(milestone.locationId).toBe(ids.entities[location.key]);
      if ('subject' in milestone) expect(milestone.subject).toBe(ids.entities[location.key]);
      if ('informant' in milestone) expect(milestone.informant).toBe(ids.entities[npc.key]);
    }
    expect(plan.commands.some((command) => command.type === 'StartCombat')).toBe(false);
  });

  it('blocks cyclic record dependencies, impossible subject time and malformed truth/attribution', () => {
    const content = bellCampaign();
    const a = content.knowledge[0];
    const b = content.knowledge[1];
    if (!a || !b) throw new Error('missing knowledge records');
    a.relations = [{ type: 'REFERS_TO', knowledge: b.key }];
    b.relations = [{ type: 'REFERS_TO', knowledge: a.key }];
    a.scope = { kind: 'WORLD_TRUTH' };
    a.knowledgeType = 'RUMOR';
    const subject = content.entities[0];
    if (!subject) throw new Error('missing subject');
    subject.existsSince = 100;
    a.subjects = [subject.key];
    a.knownSince = 99;
    b.knowledgeType = 'TESTIMONY';
    delete b.attributedTo;
    const plan = buildCampaignPlan(content, testCampaignIdentities(content));
    const codes = plan.findings.map((finding) => finding.code);
    expect(codes).toContain('REFERENCE_CYCLE');
    expect(codes).toContain('WORLD_TRUTH_TYPE');
    expect(codes).toContain('KNOWLEDGE_BEFORE_SUBJECT');
    expect(codes).toContain('TESTIMONY_SPEAKER');
    expect(plan.commands).toEqual([]);
  });

  it('checks clue, visual, encounter and quest references as preparation content', () => {
    const content = bellCampaign();
    const clue = content.clues[0];
    const encounter = content.encounters[0];
    const quest = content.quests[0];
    const person = content.entities.find((entity) => entity.kind === 'npc');
    if (!clue || !encounter || !quest || !person) throw new Error('missing story declaration');
    clue.method = 'inspect';
    clue.dc = 10;
    content.visuals.push({ entity: person.key, purpose: 'battle-map', description: '', style: '' });
    const firstCombatant = encounter.combatants[0];
    if (!firstCombatant) throw new Error('missing combatant');
    encounter.combatants.push(structuredClone(firstCombatant));
    quest.activation.subject = 'missing-subject';
    content.relationships.push({ npc: 'missing-npc', attitude: 'NEUTRAL' });
    const plan = buildCampaignPlan(content, testCampaignIdentities(content));
    const codes = plan.findings.map((finding) => finding.code);
    expect(codes).toContain('CLUE_DC');
    expect(codes).toContain('REFERENCE_KIND');
    expect(codes).toContain('DUPLICATE_COMBATANT');
    expect(codes).toContain('REFERENCE_MISSING');
    expect(plan.commands).toEqual([]);
  });

  it('retains only declared entities and never aliases mutable source sheets into the plan', () => {
    const content = bellCampaign();
    const ids = testCampaignIdentities(content);
    const snapshot = structuredClone(content);
    const retained = {
      ...ids,
      entities: { ...ids.entities, removed: '44f979ed-4400-4000-8000-000000000001' },
    };
    const plan = buildCampaignPlan(content, retained);
    expect(plan.findings).toEqual([]);
    expect(plan.commands.filter((command) => command.type === 'CreateEntity')).toHaveLength(
      content.entities.length,
    );
    const sheetCommand = plan.commands.find((command) => command.type === 'SetCharacterSheet');
    if (!sheetCommand) throw new Error('missing sheet command');
    sheetCommand.sheet.hitPoints.current = 1;
    expect(content).toEqual(snapshot);
  });
});
