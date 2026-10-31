import {
  campaignGenerationOutputSchemas,
  campaignPackageSchema,
  type CampaignEntity,
} from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { validateCampaignGenerationStep } from './generation-validation.ts';
import { buildCampaignPlan } from './plan.ts';
import { bellCampaign } from './testing/bell.ts';
import { testCampaignIdentities } from './testing/identities.ts';

const physical = [
  ['alena', 'character'],
  ['iva', 'npc'],
  ['ice-crab', 'creature'],
  ['plan-copy', 'item'],
  ['resonator', 'feature'],
] as const;
function specimen() {
  const content = bellCampaign();
  return {
    content,
    output: {
      entities: content.entities.filter((entity) => entity.kind !== 'location'),
      party: content.party,
      relationships: content.relationships,
      visuals: content.visuals,
    },
  };
}
describe('generated active cast placement', () => {
  it.each(physical)('requires placement for active %s (%s) before cast succeeds', (key, kind) => {
    const { content, output } = specimen(),
      entity = output.entities.find((value) => value.key === key);
    if (!entity) throw new Error('TEST_PHYSICAL_ENTITY');
    expect(entity.kind).toBe(kind);
    delete entity.placement;
    if (kind === 'npc') {
      // The stricter generated cast rule must not remove owner-authored offstage content.
      expect(campaignPackageSchema.safeParse(content).success).toBe(true);
      const ownerPlan = buildCampaignPlan(content, testCampaignIdentities(content));
      expect(ownerPlan.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
      expect(ownerPlan.incomplete).toBe(false);
    }
    expect(campaignGenerationOutputSchemas.cast.safeParse(output).success).toBe(true);
    const result = validateCampaignGenerationStep(content, 'cast', output);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.join('\n')).toContain(
        `CAST_PLACEMENT_INCOMPLETE at entities.${key}.placement`,
      );
  });

  it.each(physical)('allows an inactive offstage %s (%s) without placement', (key, kind) => {
    const { content, output } = specimen(),
      original = content.entities.find((value) => value.key === key);
    if (!original) throw new Error('TEST_PHYSICAL_ENTITY');
    const offstage: CampaignEntity = {
      ...structuredClone(original),
      key: `offstage-${kind}`,
      status: kind === 'item' || kind === 'feature' ? 'destroyed' : 'dead',
    };
    delete offstage.placement;
    output.entities.push(offstage);
    expect(campaignGenerationOutputSchemas.cast.safeParse(output).success).toBe(true);
    expect(validateCampaignGenerationStep(content, 'cast', output).ok).toBe(true);
  });

  it('excludes an active abstract faction and accepts all valid physical placements', () => {
    const { content, output } = specimen();
    output.entities.push({
      key: 'river-guild',
      kind: 'faction',
      name: 'River guild',
      description: 'An abstract organization.',
      status: 'active',
      existsSince: null,
    });
    expect(validateCampaignGenerationStep(content, 'cast', output).ok).toBe(true);
  });
});
