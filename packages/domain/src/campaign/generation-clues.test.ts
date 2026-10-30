import { campaignGenerationOutputSchemas, type ClueMethod } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { validateCampaignGenerationStep } from './generation-validation.ts';
import { bellCampaign } from './testing/bell.ts';

const cases: readonly [string, ClueMethod, boolean][] = [
  ['dock', 'perception', false],
  ['dock', 'investigation', false],
  ['dock', 'inspect', true],
  ['dock', 'magic', true],
  ['plan-copy', 'perception', true],
  ['plan-copy', 'investigation', true],
  ['plan-copy', 'inspect', true],
  ['plan-copy', 'magic', true],
  ['resonator', 'perception', true],
  ['resonator', 'investigation', true],
  ['resonator', 'inspect', true],
  ['resonator', 'magic', true],
];

describe('generated clue target legality matches initial authoring', () => {
  it.each(cases)('%s with method %s has supported target: %s', (entity, method, allowed) => {
    const content = bellCampaign();
    expect(content.entities.find((item) => item.key === entity)?.kind).toBe(
      entity === 'dock' ? 'location' : entity === 'plan-copy' ? 'item' : 'feature',
    );
    const output = {
      knowledge: [],
      clues: [
        {
          key: 'clue-boat-tracks',
          entity,
          method,
          statement: 'Visible tracks lead toward the boat.',
          subjects: [entity],
          ...(method === 'perception' || method === 'investigation' ? { dc: 12 } : {}),
        },
      ],
    };
    // This is the live failure class: public JSON shape alone accepts the nonempty output.
    expect(campaignGenerationOutputSchemas.knowledge.safeParse(output).success).toBe(true);
    const result = validateCampaignGenerationStep(content, 'knowledge', output);
    expect(result.ok).toBe(allowed);
    if (!allowed && !result.ok)
      expect(result.issues.join('\n')).toContain('INVALID_CLUE at clues.clue-boat-tracks.entity');
  });
});
