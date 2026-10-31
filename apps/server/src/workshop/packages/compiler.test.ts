import type { CampaignRevision } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { bellCampaign } from '../../../../../packages/domain/src/campaign/testing/bell.ts';
import { testCampaignIdentities } from '../../../../../packages/domain/src/campaign/testing/identities.ts';
import { materializeCampaign, assessCampaignRevision } from './compiler.ts';
import { campaignContentDigest } from './content.ts';

const ownerId = '30000000-0000-4000-8000-000000000001';
function revision(): CampaignRevision {
  const content = bellCampaign();
  const identities = testCampaignIdentities(content);
  return {
    draftId: '30000000-0000-4000-8000-000000000002',
    revision: 1,
    basedOnRevision: 0,
    content,
    identities,
    digest: campaignContentDigest(content, identities),
    source: { kind: 'OWNER', actorId: ownerId },
    createdAt: '2026-10-30T10:00:00.000Z',
  };
}

describe('isolated campaign materialization', () => {
  it('uses real world decisions for a different campaign without players, combat or future memories', async () => {
    const input = revision();
    const result = await materializeCampaign(input, ownerId);
    expect(result.assessment.readiness).toBe('READY');
    expect(result.assessment.findings.filter((item) => item.severity === 'error')).toEqual([]);
    expect(result.snapshot?.state.campaign?.name).toBe(input.content.world.name);
    expect(result.snapshot?.state.roster.size).toBe(0);
    expect(result.snapshot?.state.encounter).toBeNull();
    expect(result.snapshot?.history.some((event) => event.type === 'MemoryRecorded')).toBe(false);
    expect(result.snapshot?.history.some((event) => event.type === 'CombatStarted')).toBe(false);
    expect(JSON.stringify(result.snapshot?.history)).not.toContain('ravenford');
    expect(await assessCampaignRevision(input, ownerId)).toEqual(result.assessment);
  });
  it('validates prepared fights in isolated branches and rejects illegal cells without starting one', async () => {
    const input = revision();
    expect(input.content.encounters.length).toBeGreaterThan(0);
    const encounter = input.content.encounters[0];
    if (!encounter) throw new Error('missing prepared encounter');
    const combatant = encounter.combatants[0];
    if (!combatant) throw new Error('missing combatant');
    combatant.position = { x: 39, y: 39 };
    const result = await materializeCampaign(
      { ...input, digest: campaignContentDigest(input.content, input.identities) },
      ownerId,
    );
    expect(result.assessment.readiness).toBe('INVALID');
    expect(result.assessment.findings.some((finding) => finding.path.includes('encounters'))).toBe(
      true,
    );
    expect(result.snapshot?.state.encounter).toBeNull();
    expect(result.snapshot?.history.some((event) => event.type === 'CombatStarted')).toBe(false);
  });
  it('rejects impossible initial knowledge through the World Engine instead of trusting package shape', async () => {
    const input = revision();
    const knowledge = input.content.knowledge.find((record) => record.scope.kind === 'NPC');
    if (!knowledge) throw new Error('missing NPC knowledge');
    knowledge.knownSince = input.content.world.startsAt + 1000;
    const result = await materializeCampaign(
      { ...input, digest: campaignContentDigest(input.content, input.identities) },
      ownerId,
    );
    expect(result.assessment.readiness).toBe('INVALID');
    expect(result.assessment.findings.some((finding) => finding.severity === 'error')).toBe(true);
  });
  it('reports incomplete content honestly and never mutates its input', async () => {
    const input = revision();
    input.content.party = [];
    const before = JSON.stringify(input);
    expect(
      (
        await assessCampaignRevision(
          { ...input, digest: campaignContentDigest(input.content, input.identities) },
          ownerId,
        )
      ).readiness,
    ).toBe('INCOMPLETE');
    expect(JSON.stringify(input)).toBe(before);
  });
  it('refuses a mutated snapshot that no longer matches the stored revision digest', async () => {
    const input = revision();
    input.content.world.name = 'Unreviewed change';
    const result = await materializeCampaign(input, ownerId);
    expect(result.assessment.readiness).toBe('INVALID');
    expect(
      result.assessment.findings.some(
        (finding) => finding.code === 'PACKAGE_DIGEST' && finding.path === 'digest',
      ),
    ).toBe(true);
    expect(result.snapshot).toBeNull();
  });
  it('refuses a revision saved before quest identities, whose plan would publish quest slugs', async () => {
    const input = revision();
    const { entities, knowledge, clues, encounters, scene } = input.identities;
    const legacy = { entities, knowledge, clues, encounters, scene };
    const result = await materializeCampaign(
      { ...input, identities: legacy, digest: campaignContentDigest(input.content, legacy) },
      ownerId,
    );
    expect(result.assessment.readiness).toBe('INVALID');
    expect(result.assessment.findings.map((finding) => finding.code)).toEqual([
      'QUEST_IDENTITIES_MISSING',
    ]);
    expect(result.snapshot).toBeNull();
  });
});
