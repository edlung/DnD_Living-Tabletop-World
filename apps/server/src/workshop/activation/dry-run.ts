import type { CampaignFinding } from '@ltw/contracts';
import { InMemoryEventStore } from '@ltw/domain';
import { ZodError } from 'zod';

import { isolatedCampaignEngine } from '../packages/isolation.ts';
import { activationSubmission } from './submission.ts';
import type { FrozenCampaignActivation } from './store.ts';

/** Hypothetical owner consent is evaluated only in this disposable, non-injectable memory store. */
export async function validateIsolatedBootstrap(
  ownerId: string,
  frozen: FrozenCampaignActivation,
): Promise<readonly CampaignFinding[]> {
  const engine = isolatedCampaignEngine(new InMemoryEventStore(), frozen.revision.createdAt, 68000);
  let submission: ReturnType<typeof activationSubmission>;
  try {
    submission = activationSubmission({
      activationId: frozen.revision.draftId,
      campaignId: frozen.revision.draftId,
      bootstrapCommandId: `activation-preview:${frozen.revision.draftId}:${String(frozen.revision.revision)}`,
      ownerId,
      frozen,
    });
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    return [
      {
        severity: 'error',
        code: 'BOOTSTRAP_INPUT_BOUND',
        path: 'content',
        message: 'This initial campaign exceeds the supported bootstrap shape or technical size.',
      },
    ];
  }
  const result = await engine.execute(submission);
  return result.status === 'rejected'
    ? [
        {
          severity: 'error',
          code: `BOOTSTRAP_${result.code}`,
          path: 'content',
          message: 'The campaign could not be validated as one atomic initial command.',
        },
      ]
    : [];
}
