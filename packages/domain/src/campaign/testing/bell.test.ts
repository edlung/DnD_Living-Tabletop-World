import {
  campaignPackageSchema,
  characterSheetSchema,
  statBlockSchema,
  workshopIdSchema,
} from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { bellCampaign } from './bell.ts';
import { testCampaignIdentities } from './identities.ts';

describe('non-Ravenford bell preparation specimen', () => {
  it('is a strict supported package with three ready character sheets and a prepared creature', () => {
    const content = bellCampaign();
    expect(campaignPackageSchema.parse(content)).toEqual(content);
    expect(content.party).toHaveLength(3);
    for (const key of content.party)
      expect(
        characterSheetSchema.safeParse(content.entities.find((entity) => entity.key === key)?.sheet)
          .success,
      ).toBe(true);
    expect(
      statBlockSchema.safeParse(
        content.entities.find((entity) => entity.key === 'ice-crab')?.statBlock,
      ).success,
    ).toBe(true);
    expect(JSON.stringify(content)).not.toMatch(/ravenford|равенфорд|mira|мир[ае]\s+вейл/i);
  });

  it('makes opaque identities independent of input array order and uses disjoint namespaces', () => {
    const content = bellCampaign();
    const identities = testCampaignIdentities(content);
    expect(
      testCampaignIdentities({ ...content, entities: [...content.entities].reverse() }),
    ).toEqual(identities);
    const ids = [
      identities.scene,
      ...Object.values(identities.entities),
      ...Object.values(identities.knowledge),
      ...Object.values(identities.clues),
      ...Object.values(identities.encounters),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(workshopIdSchema.safeParse(id).success).toBe(true);
  });
});
