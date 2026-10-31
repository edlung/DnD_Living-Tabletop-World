import {
  campaignBriefSchema,
  campaignGenerationOutputSchemas,
  campaignGenerationStageSchema,
  campaignPackageSchema,
  type CampaignGenerationStage,
  type CampaignPackage,
  type Language,
} from '@ltw/contracts';
import { z } from 'zod';

const seedSchema = z
  .object({
    title: campaignPackageSchema.shape.world.shape.name,
    language: campaignPackageSchema.shape.world.shape.language,
    brief: campaignBriefSchema,
  })
  .strict();

/** Empty authoring content, never a generated campaign or an executable scenario. */
export function seedCampaignPackage(input: {
  readonly title: string;
  readonly language: Language;
  readonly brief: CampaignPackage['brief'];
}): CampaignPackage {
  const parsed = seedSchema.safeParse(input);
  if (!parsed.success) throw new Error('CAMPAIGN_GENERATION_SEED_INVALID');
  const { title, language, brief } = parsed.data;
  return campaignPackageSchema.parse({
    schemaVersion: 1,
    brief,
    world: {
      name: title,
      worldName: title,
      language,
      startsAt: 0,
      startLocation: null,
      weather: 'clear',
      opening: '',
    },
    entities: [],
    party: [],
    knowledge: [],
    relationships: [],
    clues: [],
    conflicts: [],
    situations: [],
    encounters: [],
    quests: [],
    visuals: [],
    firstSession: [],
    laterOutline: [],
  });
}

/** No failed parse exposes the untrusted provider output through an exception's message. */
export function mergeCampaignGenerationStep(
  content: CampaignPackage,
  stage: CampaignGenerationStage,
  output: unknown,
): CampaignPackage {
  const current = campaignPackageSchema.safeParse(content);
  if (!current.success || !campaignGenerationStageSchema.safeParse(stage).success)
    throw new Error('CAMPAIGN_GENERATION_STEP_INVALID');
  let merged: unknown;
  const value = current.data;
  switch (stage) {
    case 'concept': {
      const parsed = campaignGenerationOutputSchemas.concept.safeParse(output);
      if (parsed.success) merged = { ...value, world: { ...value.world, ...parsed.data.world } };
      break;
    }
    case 'topology': {
      const parsed = campaignGenerationOutputSchemas.topology.safeParse(output);
      if (parsed.success)
        merged = {
          ...value,
          entities: [
            ...parsed.data.locations,
            ...value.entities.filter((entity) => entity.kind !== 'location'),
          ],
          world: { ...value.world, startLocation: parsed.data.startLocation },
          conflicts: parsed.data.conflicts,
        };
      break;
    }
    case 'cast': {
      const parsed = campaignGenerationOutputSchemas.cast.safeParse(output);
      if (parsed.success)
        merged = {
          ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'possessions')),
          ...parsed.data,
          entities: [
            ...value.entities.filter((entity) => entity.kind === 'location'),
            ...parsed.data.entities,
          ],
        };
      break;
    }
    default: {
      const parsed = campaignGenerationOutputSchemas[stage].safeParse(output);
      if (parsed.success) merged = { ...value, ...parsed.data };
    }
  }
  const parsed = campaignPackageSchema.safeParse(merged);
  if (!parsed.success) throw new Error('CAMPAIGN_GENERATION_STEP_INVALID');
  return parsed.data;
}
