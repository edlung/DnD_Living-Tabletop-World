import { ImageGenerationError, type ImageJob } from '@ltw/ai';
import { describe, expect, it } from 'vitest';

import { contentHashOf } from '../assets/content-store.ts';
import { RecordingImageLedger } from '../testing/fake-image-ledger.ts';
import { jsonResponse } from '../testing/fake-fetch.ts';
import { answer, brief, dataUrl, picture, providerGenerator } from '../testing/image-provider.ts';

const draftBrief = () =>
  brief({
    subject: { scope: 'workshop', localKey: 'keeper', kind: 'npc', description: 'blue coat' },
  });
const subject = {
  kind: 'workshop' as const,
  ownerId: 'owner',
  draftId: 'draft',
  jobId: 'job',
  authSessionId: 'session',
  workerId: 'worker',
  fence: '2',
};
const job = (
  beforeDispatch: Extract<ImageJob, { subject: unknown }>['beforeDispatch'],
): ImageJob => ({
  subject,
  requestId: 'request',
  chargeId: 'charge',
  beforeDispatch,
});
const execution = async (work: Promise<unknown>) => {
  try {
    await work;
    throw new Error('EXPECTED_IMAGE_FAILURE');
  } catch (error) {
    if (!(error instanceof ImageGenerationError)) throw error;
    return error.execution;
  }
};

describe('workshop image transport boundary', () => {
  it('reserves the exact claim charge and awaits durable permission immediately before fetch', async () => {
    const ledger = new RecordingImageLedger();
    const png = await picture(8, 8);
    const { generator, calls } = providerGenerator(() => jsonResponse(answer(dataUrl(png))), {
      ledger,
      lines: [],
    });
    let release: ((allowed: boolean) => void) | undefined;
    let proof: { chargeId: string; requestDigest: string } | undefined;
    const running = generator.generate(
      draftBrief(),
      undefined,
      job((value) => {
        proof = value;
        expect(ledger.reserved).toHaveLength(1);
        return new Promise<boolean>((resolve) => {
          release = resolve;
        });
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toHaveLength(0);
    expect(ledger.reserved[0]).toMatchObject({ chargeId: 'charge', subject });
    expect(ledger.reserved[0]).not.toHaveProperty('campaignId');
    if (!release) throw new Error('DISPATCH_GATE_NOT_REACHED');
    release(true);
    const result = await running;
    expect(calls).toHaveLength(1);
    expect(proof).toEqual({
      chargeId: 'charge',
      requestDigest: contentHashOf(Buffer.from(calls[0]?.body ?? '')),
    });
    expect(result.execution).toMatchObject({
      chargeId: 'charge',
      outcome: 'generated',
      returnedModel: 'openai/gpt-5.4-image-2',
      providerRequestId: 'gen-1760000000-abc',
    });
  });

  it('never sends when the durable gate denies or throws, retaining a zero-cost settlement', async () => {
    for (const gate of [
      () => Promise.resolve(false),
      () => Promise.reject(new Error('COMMIT_ACK_LOST')),
    ]) {
      const ledger = new RecordingImageLedger();
      const { generator, calls } = providerGenerator(() => jsonResponse({}), { ledger, lines: [] });
      expect(await execution(generator.generate(draftBrief(), undefined, job(gate)))).toMatchObject(
        {
          outcome: 'not_dispatched',
        },
      );
      expect(calls).toHaveLength(0);
      expect(ledger.settled[0]?.settlement).toMatchObject({
        outcome: 'not-sent',
        costMicros: null,
      });
    }
  });

  it('rechecks abort after the committed gate and does not dispatch a cancelled request', async () => {
    const controller = new AbortController();
    const ledger = new RecordingImageLedger();
    const { generator, calls } = providerGenerator(() => jsonResponse({}), { ledger, lines: [] });
    expect(
      await execution(
        generator.generate(
          draftBrief(),
          controller.signal,
          job(() => {
            controller.abort();
            return Promise.resolve(true);
          }),
        ),
      ),
    ).toMatchObject({ outcome: 'not_dispatched' });
    expect(calls).toHaveLength(0);
    expect(ledger.settled[0]?.settlement.outcome).toBe('not-sent');
  });

  it('distinguishes an uncertain transport from a completed unusable provider response', async () => {
    for (const [respond, expected] of [
      [() => Promise.reject(new Error('NETWORK_LOST')), 'dispatch_unknown'],
      [() => jsonResponse(answer(null)), 'provider_failed'],
    ] as const) {
      const ledger = new RecordingImageLedger();
      const { generator } = providerGenerator(respond, { ledger, lines: [] });
      expect(
        await execution(
          generator.generate(
            draftBrief(),
            undefined,
            job(() => Promise.resolve(true)),
          ),
        ),
      ).toMatchObject({ outcome: expected });
      expect(ledger.settled[0]?.settlement.outcome).toBe('failed');
    }
  });

  it('sends only permitted appearance/style, never the workshop subject or narrative', async () => {
    const ledger = new RecordingImageLedger();
    const png = await picture(8, 8);
    const { generator, calls } = providerGenerator(() => jsonResponse(answer(dataUrl(png))), {
      ledger,
      lines: [],
    });
    await generator.generate(
      brief({
        subject: {
          scope: 'workshop',
          localKey: 'PRIVATE_KEY',
          kind: 'npc',
          description: 'blue coat and silver hair',
        },
        style: 'muted watercolor',
      }),
      undefined,
      job(() => Promise.resolve(true)),
    );
    expect(calls[0]?.body).toContain('blue coat and silver hair');
    expect(calls[0]?.body).toContain('muted watercolor');
    for (const forbidden of ['PRIVATE_KEY', 'owner', 'authSessionId', 'Молодой стражник'])
      expect(calls[0]?.body).not.toContain(forbidden);
  });
});
