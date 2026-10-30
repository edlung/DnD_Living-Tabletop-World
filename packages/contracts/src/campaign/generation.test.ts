import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  CAMPAIGN_GENERATION_STAGES,
  campaignGenerationOutputSchemas,
  campaignGenerationStageSchema,
} from './generation.ts';

const outputs = {
  concept: {
    world: { name: 'Harbor', worldName: 'Coast', startsAt: 0, weather: 'fog', opening: '' },
  },
  topology: { locations: [], startLocation: null, conflicts: [] },
  cast: { entities: [], party: [], relationships: [], visuals: [] },
  knowledge: { knowledge: [], clues: [] },
  encounters: { encounters: [] },
  'first-session': { situations: [], quests: [], firstSession: [] },
  outline: { laterOutline: [] },
};

describe('campaign preparation output boundaries', () => {
  it('has exactly seven ordered steps and serializable strict JSON schemas', () => {
    expect(CAMPAIGN_GENERATION_STAGES).toEqual([
      'concept',
      'topology',
      'cast',
      'knowledge',
      'encounters',
      'first-session',
      'outline',
    ]);
    expect(campaignGenerationStageSchema.safeParse('activate').success).toBe(false);
    for (const stage of CAMPAIGN_GENERATION_STAGES) {
      const schema = campaignGenerationOutputSchemas[stage];
      expect(schema.safeParse(outputs[stage]).success).toBe(true);
      expect(schema.safeParse({ ...outputs[stage], ownerId: 'forged' }).success).toBe(false);
      expect(schema.safeParse({ ...outputs[stage], brief: {} }).success).toBe(false);
      const json: unknown = JSON.parse(JSON.stringify(z.toJSONSchema(schema)));
      expect(json).toMatchObject({ type: 'object', additionalProperties: false });
    }
  });

  it('prevents concept from changing language or the topology start', () => {
    for (const field of [{ language: 'en' }, { startLocation: 'harbor' }])
      expect(
        campaignGenerationOutputSchemas.concept.safeParse({
          world: { ...outputs.concept.world, ...field },
        }).success,
      ).toBe(false);
  });

  it('keeps the location and cast partitions disjoint and location metadata explicit', () => {
    const entity = {
      key: 'harbor',
      kind: 'location',
      name: 'Harbor',
      description: '',
      status: 'active',
      existsSince: null,
    };
    expect(
      campaignGenerationOutputSchemas.topology.safeParse({
        ...outputs.topology,
        locations: [entity],
      }).success,
    ).toBe(false);
    const location = { ...entity, location: { type: 'site', parent: null } };
    expect(
      campaignGenerationOutputSchemas.topology.safeParse({
        ...outputs.topology,
        locations: [location],
      }).success,
    ).toBe(true);
    expect(
      campaignGenerationOutputSchemas.cast.safeParse({ ...outputs.cast, entities: [location] })
        .success,
    ).toBe(false);
    expect(
      campaignGenerationOutputSchemas.topology.safeParse({
        ...outputs.topology,
        locations: [{ ...location, kind: 'npc' }],
      }).success,
    ).toBe(false);
    expect(
      campaignGenerationOutputSchemas.cast.safeParse({
        ...outputs.cast,
        entities: [{ ...location, kind: 'npc' }],
      }).success,
    ).toBe(false);
  });
});
