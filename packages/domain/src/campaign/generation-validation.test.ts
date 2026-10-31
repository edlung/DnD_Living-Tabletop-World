import {
  CAMPAIGN_GENERATION_STAGES,
  type CampaignGenerationStage,
  type CampaignPackage,
} from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { mergeCampaignGenerationStep, seedCampaignPackage } from './generation.ts';
import { validateCampaignGenerationStep } from './generation-validation.ts';
import { bellCampaign } from './testing/bell.ts';

const cast = (content: CampaignPackage) => ({
  entities: content.entities.filter((entity) => entity.kind !== 'location'),
  party: [...content.party],
  relationships: content.relationships,
  visuals: content.visuals,
});
function outputFor(stage: CampaignGenerationStage, content: CampaignPackage): unknown {
  switch (stage) {
    case 'concept': {
      const { name, worldName, startsAt, weather, opening } = content.world;
      return { world: { name, worldName, startsAt, weather, opening } };
    }
    case 'topology':
      return {
        locations: content.entities.filter((entity) => entity.kind === 'location'),
        startLocation: content.world.startLocation,
        conflicts: content.conflicts,
      };
    case 'cast':
      return cast(content);
    case 'knowledge':
      return { knowledge: content.knowledge, clues: content.clues };
    case 'encounters':
      return { encounters: content.encounters };
    case 'first-session':
      return {
        situations: content.situations,
        quests: content.quests,
        firstSession: content.firstSession,
      };
    case 'outline':
      return { laterOutline: content.laterOutline };
  }
}
function topology() {
  const complete = bellCampaign(),
    seed = seedCampaignPackage({ title: 'Unwritten', language: 'ru', brief: complete.brief });
  const concept = mergeCampaignGenerationStep(seed, 'concept', outputFor('concept', complete));
  return {
    complete,
    seed,
    concept,
    content: mergeCampaignGenerationStep(concept, 'topology', outputFor('topology', complete)),
  };
}
function issues(content: CampaignPackage, stage: CampaignGenerationStage, output: unknown) {
  const result = validateCampaignGenerationStep(content, stage, output);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues;
}

describe('stage-owned campaign semantic validation', () => {
  it('rejects the observed live failure: no cast declarations behind party, relationships and visual references', () => {
    const f = topology();
    expect(
      validateCampaignGenerationStep(f.content, 'cast', { ...cast(f.complete), entities: [] }).ok,
    ).toBe(false);
  });
  it('cannot bypass party declarations by returning one unrelated, schema-valid NPC', () => {
    const f = topology(),
      npc = f.complete.entities.find((entity) => entity.kind === 'npc');
    if (!npc) throw new Error('TEST_NPC');
    const result = issues(f.content, 'cast', { ...cast(f.complete), entities: [npc] }).join('\n');
    expect(result).toContain('REFERENCE_MISSING at party.');
  });

  it('accepts all seven valid partitions without demanding future sections or mutating inputs', () => {
    const f = topology();
    let current = f.seed;
    for (const stage of CAMPAIGN_GENERATION_STAGES) {
      const before = structuredClone(current),
        output = outputFor(stage, f.complete),
        beforeOutput = structuredClone(output);
      const result = validateCampaignGenerationStep(current, stage, output);
      expect(result, stage).toMatchObject({ ok: true });
      if (!result.ok) throw new Error('TEST_VALID_STAGE_REJECTED');
      expect(current).toEqual(before);
      expect(output).toEqual(beforeOutput);
      current = result.value;
    }
    expect(current).toEqual(f.complete);
  });

  it('defers future conflict actors at topology, then requires them once cast owns their declarations', () => {
    const f = topology(),
      unknown = {
        ...f.complete.conflicts[0],
        key: 'pending-conflict',
        title: 'Pending actor',
        description: '',
        stakes: '',
        actors: ['undeclared-actor'],
      };
    const shape = outputFor('topology', f.complete);
    if (!shape || typeof shape !== 'object') throw new Error('TEST_TOPOLOGY');
    const result = validateCampaignGenerationStep(f.concept, 'topology', {
      ...shape,
      conflicts: [unknown],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('TEST_PREMATURE_CAST_CHECK');
    expect(issues(result.value, 'cast', cast(f.complete)).join('\n')).toContain(
      'REFERENCE_MISSING',
    );
  });

  it.each([
    'party-size',
    'party-kind',
    'missing-sheet',
    'party-level',
    'wrong-place',
    'missing-place',
    'relationship-kind',
    'visual-kind',
  ] as const)('rejects cast %s while fields can still be repaired by this step', (kind) => {
    const f = topology(),
      changed = structuredClone(f.complete);
    const alena = changed.entities.find((entity) => entity.key === 'alena');
    if (!alena) throw new Error('TEST_CHARACTER');
    if (kind === 'party-size') changed.party.pop();
    if (kind === 'party-kind') {
      alena.kind = 'npc';
      delete alena.sheet;
    }
    if (kind === 'missing-sheet') delete alena.sheet;
    if (kind === 'party-level' && alena.sheet?.classes[0]) alena.sheet.classes[0].level = 2;
    if (kind === 'wrong-place') alena.placement = { location: 'archive', since: null };
    if (kind === 'missing-place') alena.placement = { location: 'not-a-place', since: null };
    if (kind === 'relationship-kind')
      changed.relationships.push({ npc: 'alena', attitude: 'FRIENDLY' });
    if (kind === 'visual-kind')
      changed.visuals.push({
        entity: 'dock',
        purpose: 'figure',
        description: 'An unsupported place figure.',
        style: '',
      });
    expect(issues(f.content, 'cast', cast(changed)).length).toBeGreaterThan(0);
  });

  it('checks topology start, location cycles and duplicate keys without requiring cast or first-session content', () => {
    const f = topology();
    expect(
      issues(f.concept, 'topology', {
        locations: [],
        startLocation: 'missing',
        conflicts: [],
      }).join('\n'),
    ).toContain('REFERENCE_MISSING');
    const first = f.complete.entities.find((entity) => entity.kind === 'location');
    if (!first) throw new Error('TEST_LOCATION');
    expect(
      issues(f.concept, 'topology', {
        locations: [{ ...first, location: { type: 'region', parent: first.key } }],
        startLocation: first.key,
        conflicts: [],
      }).join('\n'),
    ).toContain('REFERENCE_CYCLE');
    expect(
      issues(f.concept, 'topology', {
        locations: [first, first],
        startLocation: first.key,
        conflicts: [],
      }).join('\n'),
    ).toContain('DUPLICATE_KEY');
  });

  it('checks knowledge holders, clue subjects and dependency cycles after cast exists', () => {
    const complete = bellCampaign(),
      changed = structuredClone(complete),
      first = changed.knowledge[0],
      second = changed.knowledge[1],
      clue = changed.clues[0];
    if (!first || !second || !clue) throw new Error('TEST_KNOWLEDGE');
    first.scope = { kind: 'NPC', holder: 'not-declared' };
    first.relations = [{ type: 'SUPPORTS', knowledge: second.key }];
    second.relations = [{ type: 'SUPPORTS', knowledge: first.key }];
    clue.subjects.push('missing-clue-subject');
    const result = issues(complete, 'knowledge', outputFor('knowledge', changed)).join('\n');
    expect(result).toContain('REFERENCE_MISSING');
    expect(result).toContain('REFERENCE_CYCLE');
  });

  it('checks encounter references and statistics after cast, with first-session content still empty', () => {
    const f = topology(),
      current = mergeCampaignGenerationStep(f.content, 'cast', cast(f.complete));
    const encounter = structuredClone(f.complete.encounters[0]);
    if (!encounter) throw new Error('TEST_ENCOUNTER');
    encounter.combatants.push({
      entity: 'not-declared',
      side: 'hostile',
      position: { x: 0, y: 0 },
    });
    expect(issues(current, 'encounters', { encounters: [encounter] }).join('\n')).toContain(
      'REFERENCE_MISSING',
    );
    const crab = current.entities.find((entity) => entity.key === 'ice-crab');
    if (!crab) throw new Error('TEST_CREATURE');
    delete crab.statBlock;
    expect(issues(current, 'encounters', outputFor('encounters', f.complete)).join('\n')).toContain(
      'COMBATANT_STATS',
    );
  });

  it('checks first-session participants, clues and quest references without requiring a later outline', () => {
    const complete = bellCampaign(),
      changed = structuredClone(complete),
      situation = changed.situations[0],
      quest = changed.quests[0];
    if (!situation || !quest) throw new Error('TEST_FIRST_SESSION');
    situation.participants.push('not-a-participant');
    situation.clueKeys.push('missing-clue');
    quest.activation.subject = 'missing-quest-subject';
    const result = issues(complete, 'first-session', outputFor('first-session', changed)).join(
      '\n',
    );
    expect(result).toContain('REFERENCE_MISSING');
    expect(result).toContain('participants');
    expect(result).toContain('clueKeys');
    expect(result).toContain('activation');
    expect(
      issues(complete, 'first-session', { situations: [], quests: [], firstSession: [] }).join(
        '\n',
      ),
    ).toContain('SESSION_PLAN_INCOMPLETE');
  });

  it('returns bounded actionable failures and never quotes raw unsupported provider values', () => {
    const f = topology(),
      output = cast(f.complete);
    output.entities.push(
      ...Array.from({ length: 100 }, (_, index) => ({
        key: `missing-place-${index}`,
        kind: 'npc' as const,
        name: 'An offstage NPC',
        description: '',
        status: 'active' as const,
        existsSince: null,
        placement: { location: 'not-a-place', since: null },
      })),
    );
    const bounded = issues(f.content, 'cast', output);
    expect(bounded.length).toBeLessThanOrEqual(32);
    expect(bounded.join('\n')).toContain('ISSUE_LIMIT');
    const schema = issues(f.complete, 'concept', {
      world: {
        name: 'Name',
        worldName: 'World',
        startsAt: 0,
        weather: 'PRIVATE_PROVIDER_LITERAL',
        opening: 'Opening',
      },
    }).join('\n');
    expect(schema).toContain('world.weather');
    expect(schema).not.toContain('PRIVATE_PROVIDER_LITERAL');
  });
  it('does not universally require optional investigation, combat, quests or later outline', () => {
    const content = bellCampaign();
    expect(
      validateCampaignGenerationStep(content, 'knowledge', { knowledge: [], clues: [] }).ok,
    ).toBe(true);
    expect(validateCampaignGenerationStep(content, 'encounters', { encounters: [] }).ok).toBe(true);
    expect(
      validateCampaignGenerationStep(content, 'first-session', {
        situations: [],
        quests: [],
        firstSession: ['Prepare one open social scene.'],
      }).ok,
    ).toBe(true);
    expect(validateCampaignGenerationStep(content, 'outline', { laterOutline: [] }).ok).toBe(true);
  });
});
