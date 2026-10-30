import type { CampaignBootstrapAsset } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { buildCampaignBootstrapPlan } from './bootstrap-plan.ts';
import { bellCampaign } from './testing/bell.ts';
import { testCampaignIdentities } from './testing/identities.ts';

const hash = (n: number) => `sha256:${n.toString(16).padStart(64, '0')}`;
function fixture() {
  const content = bellCampaign(),
    ids = testCampaignIdentities(content);
  const entityId = ids.entities['arden'];
  if (!entityId) throw new Error('ENTITY_MISSING');
  const reference: CampaignBootstrapAsset = {
    entityId,
    purpose: 'image',
    variant: 'reference',
    label: null,
    audience: 'players',
    contentHash: hash(1),
    mediaType: 'image/webp',
    generator: { provider: 'fixture', model: 'offline' },
    origin: {
      draftId: '10000000-0000-4000-8000-000000000001',
      revision: 1,
      candidateId: '10000000-0000-4000-8000-000000000002',
      jobId: '10000000-0000-4000-8000-000000000003',
      sourceSignature: hash(2),
      referenceHash: null,
      manifestDigest: hash(3),
    },
  };
  return {
    content,
    ids,
    reference,
    derived: {
      ...reference,
      purpose: 'figure' as const,
      variant: 'derived' as const,
      label: 'figure',
      contentHash: hash(4),
      origin: { ...reference.origin, referenceHash: reference.contentHash },
    },
  };
}

describe('bounded bootstrap plan', () => {
  it('uses the initial compiler and preserves prepared party without inventing controllers', () => {
    const f = fixture(),
      plan = buildCampaignBootstrapPlan(f.content, f.ids, [], 'TEXT_ONLY');
    expect(plan.findings.filter((entry) => entry.severity === 'error')).toEqual([]);
    expect(plan.preparedParty).toEqual(f.content.party.map((key) => f.ids.entities[key]));
    expect(
      plan.commands.some((command) =>
        [
          'AssignCharacter',
          'RecordMemory',
          'StartSession',
          'StartCombat',
          'GenerateChronicle',
          'ApplyAuthoring',
        ].includes(command.type),
      ),
    ).toBe(false);
    expect(plan.quests[0]?.activation.subject).not.toBe(f.content.quests[0]?.activation.subject);
  });
  it('sorts references before derived choices deterministically without mutating the input', () => {
    const f = fixture(),
      assets = [f.derived, f.reference],
      before = structuredClone(assets);
    const first = buildCampaignBootstrapPlan(f.content, f.ids, assets, 'CHOSEN'),
      second = buildCampaignBootstrapPlan(f.content, f.ids, [...assets].reverse(), 'CHOSEN');
    expect(first.assets).toEqual([f.reference, f.derived]);
    expect(second).toEqual(first);
    expect(assets).toEqual(before);
  });
  it('blocks orphaned/mismatched derived bytes, duplicate kinds and invalid purpose subjects', () => {
    const f = fixture();
    for (const assets of [
      [f.derived],
      [f.reference, { ...f.derived, origin: { ...f.derived.origin, referenceHash: hash(9) } }],
      [f.reference, f.reference],
      [{ ...f.reference, purpose: 'battle-map' as const }],
    ])
      expect(
        buildCampaignBootstrapPlan(f.content, f.ids, assets, 'CHOSEN').findings.some(
          (entry) => entry.severity === 'error',
        ),
      ).toBe(true);
  });
  it('does not silently convert a missing selection to text-only or adopt ignored text-only choices', () => {
    const f = fixture();
    expect(buildCampaignBootstrapPlan(f.content, f.ids, [], 'CHOSEN').findings).toMatchObject([
      { code: 'BOOTSTRAP_PICTURES_REQUIRED' },
    ]);
    const text = buildCampaignBootstrapPlan(f.content, f.ids, [f.reference], 'TEXT_ONLY');
    expect(text.assets).toEqual([]);
    expect(text.findings.some((entry) => entry.code === 'BOOTSTRAP_TEXT_ONLY_ASSETS')).toBe(true);
  });
});
