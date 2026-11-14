import { describe, expect, it } from 'vitest';

import { buildCampaignPlan } from './plan.ts';
import { bellCampaign } from './testing/bell.ts';
import { testCampaignIdentities } from './testing/identities.ts';

/**
 * A package NPC's manner of speech (docs/adr/0020-npc-intelligence.md, amendment 2026-11-14)
 * becomes its `CreateEntity`'s manner; any other kind with one is a plan error.
 */
const ORDERS = 'Speaks briefly, as if reading out an order.';

describe('a package manner of speech in the plan', () => {
  it("an NPC's manner rides its CreateEntity; an NPC without one gets none", () => {
    const content = bellCampaign();
    const [first, second] = content.entities.filter((entity) => entity.kind === 'npc');
    if (!first || !second) throw new Error('the specimen needs two NPCs');
    first.manner = ORDERS;
    const ids = testCampaignIdentities(content);
    const plan = buildCampaignPlan(content, ids);
    expect(plan.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    const created = (key: string) =>
      plan.commands.find(
        (command) => command.type === 'CreateEntity' && command.entityId === ids.entities[key],
      );
    expect(created(first.key)).toMatchObject({ manner: ORDERS });
    expect(created(second.key)).not.toHaveProperty('manner');
  });

  it('refuses a manner on anything but an NPC', () => {
    const content = bellCampaign();
    const other = content.entities.find((entity) => entity.kind === 'location');
    if (!other) throw new Error('the specimen needs a location');
    other.manner = ORDERS;
    const plan = buildCampaignPlan(content, testCampaignIdentities(content));
    expect(plan.commands).toEqual([]);
    expect(plan.findings).toContainEqual(
      expect.objectContaining({ code: 'MANNER_KIND', path: `entities.${other.key}.manner` }),
    );
  });
});
