import { describe, expect, it } from 'vitest';

import { buildCampaignPlan } from './plan.ts';
import { bellCampaign } from './testing/bell.ts';
import { testCampaignIdentities } from './testing/identities.ts';

/** Gate 07, G07-07: a secret-like record in a scope players read is a warning, never silent. */
describe('secret-like knowledge in player-visible scopes', () => {
  it.each(['PUBLIC', 'PARTY'] as const)(
    'warns for a SECRET in %s scope and still compiles',
    (kind) => {
      const content = bellCampaign();
      const record = content.knowledge.find((entry) => entry.scope.kind === 'WORLD_TRUTH');
      if (!record) throw new Error('fixture');
      record.scope = { kind };
      record.knowledgeType = 'SECRET';
      const plan = buildCampaignPlan(content, testCampaignIdentities(content));
      expect(plan.findings).toContainEqual(
        expect.objectContaining({ severity: 'warning', code: 'SECRET_IN_PUBLIC_SCOPE' }),
      );
      expect(plan.findings.some((finding) => finding.severity === 'error')).toBe(false);
      expect(plan.commands.length).toBeGreaterThan(0);
    },
  );

  it('is silent for the same type in private scopes', () => {
    const content = bellCampaign();
    const record = content.knowledge.find((entry) => entry.scope.kind === 'WORLD_TRUTH');
    if (!record) throw new Error('fixture');
    record.knowledgeType = 'SECRET';
    const plan = buildCampaignPlan(content, testCampaignIdentities(content));
    expect(plan.findings.map((finding) => finding.code)).not.toContain('SECRET_IN_PUBLIC_SCOPE');
  });
});
