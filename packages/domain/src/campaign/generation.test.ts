import {
  CAMPAIGN_GENERATION_STAGES,
  campaignPackageSchema,
  type CampaignGenerationOutputByStage,
  type CampaignPackage,
} from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { mergeCampaignGenerationStep, seedCampaignPackage } from './generation.ts';
import { buildCampaignPlan } from './plan.ts';
import { bellCampaign } from './testing/bell.ts';
import { testCampaignIdentities } from './testing/identities.ts';

function steps(content: CampaignPackage): CampaignGenerationOutputByStage {
  const world = {
    name: content.world.name,
    worldName: content.world.worldName,
    startsAt: content.world.startsAt,
    weather: content.world.weather,
    opening: content.world.opening,
  };
  return {
    concept: { world },
    topology: {
      locations: content.entities
        .filter((entity) => entity.kind === 'location')
        .map((entity) => ({
          ...entity,
          kind: 'location',
          location: entity.location ?? { type: 'site', parent: null },
        })),
      startLocation: content.world.startLocation,
      conflicts: content.conflicts,
    },
    cast: {
      entities: content.entities
        .filter((entity) => entity.kind !== 'location')
        .map((entity) => ({
          ...entity,
          kind: entity.kind as Exclude<typeof entity.kind, 'location'>,
        })),
      party: content.party,
      relationships: content.relationships,
      visuals: content.visuals,
    },
    knowledge: { knowledge: content.knowledge, clues: content.clues },
    encounters: { encounters: content.encounters },
    'first-session': {
      situations: content.situations,
      quests: content.quests,
      firstSession: content.firstSession,
    },
    outline: { laterOutline: content.laterOutline },
  };
}

describe('pure campaign preparation assembly', () => {
  it('seeds a valid incomplete package without pretending that anything was generated', () => {
    const brief = bellCampaign().brief;
    const content = seedCampaignPackage({ title: 'Unwritten', language: 'en', brief });
    expect(campaignPackageSchema.parse(content)).toEqual(content);
    expect(content).toMatchObject({
      brief,
      entities: [],
      knowledge: [],
      party: [],
      encounters: [],
      firstSession: [],
      world: { name: 'Unwritten', language: 'en', startLocation: null, opening: '' },
    });
    expect(buildCampaignPlan(content, testCampaignIdentities(content)).incomplete).toBe(true);
    brief.include.push('changed after seeding');
    expect(content.brief.include).not.toContain('changed after seeding');
    expect(() => seedCampaignPackage({ title: '', language: 'en', brief })).toThrow(
      'CAMPAIGN_GENERATION_SEED_INVALID',
    );
  });

  it('assembles all seven partitions while every intermediate value remains a valid package', () => {
    const complete = bellCampaign();
    const outputs = steps(complete);
    let current = seedCampaignPackage({
      title: complete.world.name,
      language: complete.world.language,
      brief: complete.brief,
    });
    for (const stage of CAMPAIGN_GENERATION_STAGES) {
      const previous = current;
      const before = structuredClone(current);
      const outputBefore = structuredClone(outputs[stage]);
      current = mergeCampaignGenerationStep(current, stage, outputs[stage]);
      expect(campaignPackageSchema.safeParse(current).success).toBe(true);
      expect(current.brief).toEqual(complete.brief);
      expect(current.world.language).toBe(complete.world.language);
      expect(previous).toEqual(before);
      expect(outputs[stage]).toEqual(outputBefore);
    }
    expect(current).toEqual(complete);
    const plan = buildCampaignPlan(current, testCampaignIdentities(current));
    expect(plan.incomplete).toBe(false);
    expect(plan.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
  });

  it('changes only fields owned by the selected step, including the shared entities array', () => {
    const current = bellCampaign();
    const outputs = steps(current);
    const owned = {
      concept: ['world'],
      topology: ['world', 'entities', 'conflicts'],
      cast: ['entities', 'party', 'relationships', 'visuals'],
      knowledge: ['knowledge', 'clues'],
      encounters: ['encounters'],
      'first-session': ['situations', 'quests', 'firstSession'],
      outline: ['laterOutline'],
    };
    for (const stage of CAMPAIGN_GENERATION_STAGES) {
      const before = structuredClone(current);
      const merged = mergeCampaignGenerationStep(current, stage, outputs[stage]);
      expect(current).toEqual(before);
      for (const key of Object.keys(current) as (keyof CampaignPackage)[])
        if (!owned[stage].includes(key)) expect(merged[key]).toEqual(current[key]);
    }
    const topology = mergeCampaignGenerationStep(current, 'topology', {
      ...outputs.topology,
      locations: [],
      startLocation: null,
    });
    expect(topology.entities).toEqual(
      current.entities.filter((entity) => entity.kind !== 'location'),
    );
    const cast = mergeCampaignGenerationStep(current, 'cast', {
      entities: outputs.cast.entities,
      party: outputs.cast.party,
      relationships: [],
      visuals: [],
    });
    expect(cast.entities.filter((entity) => entity.kind === 'location')).toEqual(
      current.entities.filter((entity) => entity.kind === 'location'),
    );
    expect(cast.entities.filter((entity) => entity.kind !== 'location')).toEqual(
      outputs.cast.entities,
    );
    expect(topology.world.language).toBe(current.world.language);
    expect(topology.world.opening).toBe(current.world.opening);
  });

  it('fails closed with a fixed error for output injection, invalid mechanics and aggregate overflow', () => {
    const content = bellCampaign();
    const output = steps(content);
    for (const stage of CAMPAIGN_GENERATION_STAGES)
      expect(() =>
        mergeCampaignGenerationStep(content, stage, {
          ...output[stage],
          brief: { intent: 'PRIVATE_INJECTION' },
        }),
      ).toThrow(/^CAMPAIGN_GENERATION_STEP_INVALID$/);
    expect(() =>
      mergeCampaignGenerationStep(content, 'concept', {
        world: { ...output.concept.world, weather: 'PRIVATE_INJECTION' },
      }),
    ).toThrow(/^CAMPAIGN_GENERATION_STEP_INVALID$/);
    const entity = output.cast.entities[0];
    expect(() =>
      mergeCampaignGenerationStep(content, 'cast', {
        ...output.cast,
        entities: Array.from({ length: 500 }, () => entity),
      }),
    ).toThrow(/^CAMPAIGN_GENERATION_STEP_INVALID$/);
  });

  it('defers graph readiness until the assembled job instead of inventing missing references', () => {
    const seed = seedCampaignPackage({
      title: 'Seed',
      language: 'en',
      brief: bellCampaign().brief,
    });
    const content = mergeCampaignGenerationStep(seed, 'topology', {
      locations: [],
      startLocation: 'not-yet-written',
      conflicts: [],
    });
    expect(content.world.startLocation).toBe('not-yet-written');
    expect(campaignPackageSchema.safeParse(content).success).toBe(true);
    expect(buildCampaignPlan(content, testCampaignIdentities(content)).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'REFERENCE_MISSING' })]),
    );
  });
});
