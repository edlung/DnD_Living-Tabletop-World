import { randomUUID } from 'node:crypto';

import type { CampaignRevision } from '@ltw/contracts';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { contentHashOf } from '../assets/content-store.ts';
import { Secret } from '../platform/config/config.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { emptyCampaignPackage } from '../testing/campaign-packages.ts';
import { STYLE, picture } from '../testing/image-provider.ts';
import { draftImageBrief, draftImageInputSchema } from './draft-input.ts';
import { createDraftImageRuntime } from './draft-runtime.ts';
import { requestBody } from './openrouter-generator.ts';

const pool = new pg.Pool(); // prepare and placeholder availability never connect.
afterAll(async () => pool.end());
const entityId = randomUUID();
function revision(): CampaignRevision {
  const content = emptyCampaignPackage();
  content.entities.push({
    key: 'keeper',
    kind: 'npc',
    name: 'PRIVATE_NAME',
    description: 'PRIVATE_MOTIVE_AND_SECRET',
    status: 'active',
    existsSince: null,
  });
  content.visuals.push({
    entity: 'keeper',
    purpose: 'image',
    description: 'silver hair and a blue coat',
    style: 'muted watercolor',
  });
  return {
    draftId: randomUUID(),
    revision: 1,
    basedOnRevision: 0,
    content,
    identities: {
      entities: { keeper: entityId },
      knowledge: {},
      clues: {},
      encounters: {},
      scene: randomUUID(),
    },
    digest: `sha256:${'a'.repeat(64)}`,
    source: { kind: 'OWNER', actorId: randomUUID() },
    createdAt: new Date().toISOString(),
  };
}
const runtime = (placeholder = false) =>
  createDraftImageRuntime({
    pool,
    config: {
      assets: {
        workerIntervalMs: 10,
        generationTimeoutMs: 5000,
        generator: placeholder
          ? { kind: 'placeholder' }
          : {
              kind: 'openrouter-openai',
              apiKey: new Secret('TEST_ONLY'),
              model: 'openai/gpt-5.4-image-2',
            },
      },
    },
    contents: { content: () => Promise.resolve(null) },
    styleReferences: STYLE,
    logger: createLogger({ service: 'draft-input-test', level: 'silent' }),
  });

describe('private draft image preparation', () => {
  it('normalizes permitted art fields and binds the exact request without revealing narrative identity', async () => {
    const source = revision();
    const prepared = await runtime().prepare({
      revision: source,
      entityId,
      purpose: 'image',
      reference: null,
    });
    if (prepared.status !== 'PREPARED') throw new Error('PREPARATION_FAILED');
    expect(prepared.input).toMatchObject({
      schemaVersion: 1,
      appearance: 'silver hair and a blue coat',
      style: 'muted watercolor',
      purpose: 'image',
      variant: 'reference',
      reference: null,
    });
    expect(draftImageInputSchema.safeParse(prepared.input).success).toBe(true);
    const body = JSON.stringify(
      requestBody(draftImageBrief(prepared.input, null, 'test'), 'openai/gpt-5.4-image-2', STYLE),
    );
    expect(contentHashOf(Buffer.from(body))).toBe(prepared.requestDigest);
    for (const forbidden of ['PRIVATE_NAME', 'PRIVATE_MOTIVE_AND_SECRET', entityId, 'keeper'])
      expect(body).not.toContain(forbidden);
  });

  it('derives a figure from exact chosen raster bytes and falls back to its permitted image brief', async () => {
    const bytes = await picture(8, 8);
    const source = revision();
    const reference = {
      candidateId: randomUUID(),
      contentHash: contentHashOf(bytes),
      mediaType: 'image/png' as const,
      bytes,
    };
    const prepared = await runtime().prepare({
      revision: source,
      entityId,
      purpose: 'figure',
      reference,
    });
    if (prepared.status !== 'PREPARED') throw new Error('PREPARATION_FAILED');
    expect(prepared.input).toMatchObject({
      appearance: source.content.visuals[0]?.description,
      purpose: 'figure',
      variant: 'derived',
      label: 'figure',
      reference: { contentHash: reference.contentHash },
      stylePolicy: { referenceHashes: [] },
    });
    const body = JSON.stringify(
      requestBody(
        draftImageBrief(prepared.input, reference, 'test'),
        'openai/gpt-5.4-image-2',
        STYLE,
      ),
    );
    expect(contentHashOf(Buffer.from(body))).toBe(prepared.requestDigest);
    expect(
      await runtime().prepare({
        revision: source,
        entityId,
        purpose: 'figure',
        reference: { ...reference, contentHash: `sha256:${'0'.repeat(64)}` },
      }),
    ).toMatchObject({ status: 'UNAVAILABLE' });
    expect(
      await runtime().prepare({ revision: source, entityId, purpose: 'figure', reference: null }),
    ).toMatchObject({ status: 'UNAVAILABLE' });
  });

  it('does not invent appearance or silently choose between duplicate subjects/briefs', async () => {
    for (const mutate of [
      (value: CampaignRevision) => {
        const visual = value.content.visuals[0];
        if (visual) visual.description = '';
      },
      (value: CampaignRevision) => {
        const visual = value.content.visuals[0];
        if (visual) value.content.visuals.push({ ...visual });
      },
      (value: CampaignRevision) => {
        const entity = value.content.entities[0];
        if (entity) value.content.entities.push({ ...entity });
      },
    ]) {
      const source = revision();
      mutate(source);
      expect(
        await runtime().prepare({ revision: source, entityId, purpose: 'image', reference: null }),
      ).toMatchObject({ status: 'UNAVAILABLE' });
    }
  });

  it('keeps placeholder generation honestly unavailable without reading storage or making a call', async () => {
    const offline = runtime(true);
    expect(await offline.availability(randomUUID())).toMatchObject({
      available: false,
      reason: 'NO_ROUTE',
      provider: null,
      model: null,
    });
    expect(
      await offline.prepare({ revision: revision(), entityId, purpose: 'image', reference: null }),
    ).toMatchObject({ status: 'UNAVAILABLE' });
  });
});
