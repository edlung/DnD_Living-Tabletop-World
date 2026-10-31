import { randomUUID } from 'node:crypto';

import { campaignPackageSchema, saveCampaignRevisionSchema } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

const empty = () => ({
  schemaVersion: 1,
  brief: {
    intent: 'Колокол подо льдом',
    setting: '',
    tone: '',
    duration: '',
    partySize: 3,
    partyLevel: 3,
    include: [],
    exclude: [],
  },
  world: {
    name: 'Колокол',
    worldName: 'Белая Пристань',
    language: 'ru',
    startsAt: 0,
    startLocation: null,
    weather: 'snow',
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

describe('campaign package boundary', () => {
  it('stores a strict incomplete draft without inventing canonical IDs or facts', () => {
    expect(campaignPackageSchema.parse(empty())).toEqual(empty());
    expect(campaignPackageSchema.safeParse({ ...empty(), ownerId: randomUUID() }).success).toBe(
      false,
    );
    expect(campaignPackageSchema.safeParse({ ...empty(), canonicalIds: {} }).success).toBe(false);
    expect(campaignPackageSchema.safeParse({ ...empty(), schemaVersion: 99 }).success).toBe(false);
  });
  it('rejects unsupported mechanics and malformed graph keys at the shape boundary', () => {
    const content = empty();
    expect(
      campaignPackageSchema.safeParse({
        ...content,
        world: { ...content.world, weather: 'magic-fire' },
      }).success,
    ).toBe(false);
    expect(
      campaignPackageSchema.safeParse({
        ...content,
        entities: [
          {
            key: 'Secret Name!',
            kind: 'npc',
            name: 'Iva',
            description: '',
            status: 'active',
            existsSince: null,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      campaignPackageSchema.safeParse({
        ...content,
        knowledge: [
          {
            key: 'lie',
            scope: { kind: 'OMNISCIENT' },
            knowledgeType: 'FACT',
            statement: 'A claim',
            subjects: [],
            knownSince: null,
            relations: [],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it('accepts an explicit base revision and refuses forged AI provenance or identities in an HTTP write', () => {
    const request = { requestId: randomUUID(), basedOnRevision: 0, content: empty() };
    expect(saveCampaignRevisionSchema.safeParse(request).success).toBe(true);
    expect(
      saveCampaignRevisionSchema.safeParse({ ...request, basedOnRevision: 1_000_000 }).success,
    ).toBe(false);
    expect(
      saveCampaignRevisionSchema.safeParse({ ...request, basedOnRevision: 999_999 }).success,
    ).toBe(true);
    expect(saveCampaignRevisionSchema.safeParse({ ...request, basedOnRevision: -1 }).success).toBe(
      false,
    );
    expect(
      saveCampaignRevisionSchema.safeParse({
        ...request,
        source: { kind: 'AI', traceId: randomUUID() },
      }).success,
    ).toBe(false);
    expect(saveCampaignRevisionSchema.safeParse({ ...request, identities: {} }).success).toBe(
      false,
    );
  });
});
