import { describe, expect, it } from 'vitest';

import { editFixture } from '../../testing/generation/edit-fixture.ts';
import { imageDigest } from '../images/manifest.ts';
import { campaignEditPrompt } from './edit-prompt.ts';
import { parseCampaignEditSpec } from './edit-spec.ts';

describe('immutable edit request specification', () => {
  it('accepts a strict recorded snapshot and separates private data from system/schema', async () => {
    const f = await editFixture();
    expect(parseCampaignEditSpec(f.spec)).toEqual(f.spec);
    const payload = campaignEditPrompt(f.content, f.spec);
    expect(payload.output.name).toBe('prepare_campaign_edit');
    expect(payload.system).not.toContain(f.spec.instruction);
    expect(payload.system).not.toContain(f.content.world.opening);
    expect(JSON.stringify(payload.output)).not.toContain(f.spec.instruction);
    expect(JSON.parse(payload.prompt)).toMatchObject({
      stage: 'edit',
      instruction: f.spec.instruction,
      baseline: f.content,
      closure: f.spec.closure,
    });
  });
  it('rejects changed lock projections/digest, duplicate permissions and unknown persisted fields', async () => {
    const f = await editFixture();
    expect(() => parseCampaignEditSpec({ ...f.spec, untrusted: true })).toThrow();
    expect(() =>
      parseCampaignEditSpec({
        ...f.spec,
        requestedTargets: [...f.spec.requestedTargets, ...f.spec.requestedTargets],
      }),
    ).toThrow();
    expect(() =>
      parseCampaignEditSpec({ ...f.spec, closure: [...f.spec.closure, ...f.spec.closure] }),
    ).toThrow();
    expect(() =>
      parseCampaignEditSpec({ ...f.spec, lockSnapshot: { ...f.locks, version: 1 } }),
    ).toThrow();
    const projection = { private: 'original' };
    const snapshot = {
      version: 0,
      revision: 1,
      packageDigest: f.base.digest,
      manifestDigest: f.manifest.digest,
      entries: [
        {
          target: { kind: 'content' as const, targetId: 'section:world' },
          label: 'World',
          projection,
          digest: imageDigest(projection),
        },
      ],
    };
    const spec = {
      ...f.spec,
      lockSnapshot: { ...snapshot, digest: imageDigest(snapshot), createdAt: f.base.createdAt },
    };
    expect(parseCampaignEditSpec(spec)).toEqual(spec);
    const corrupted = structuredClone(spec);
    const first = corrupted.lockSnapshot.entries[0];
    if (!first) throw new Error('entry missing');
    first.projection.private = 'changed';
    expect(() => parseCampaignEditSpec(corrupted)).toThrow();
  });
});
