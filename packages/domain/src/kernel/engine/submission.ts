import { campaignIdSchema, commandIdSchema, kernelCommandSchema } from '@ltw/contracts';
import { z } from 'zod';

import { actorSchema } from '../actor.ts';
import { canonicalJson } from '../canonical-json.ts';

/**
 * What the application layer submits to the World Engine: a client command
 * plus trusted metadata (actor from authentication, idempotency key).
 */
export const commandSubmissionSchema = z
  .object({
    /** Idempotency key: resubmitting the same submission returns the original outcome. */
    commandId: commandIdSchema,
    /** Required except for CreateCampaign, where a missing ID is generated. */
    campaignId: campaignIdSchema.optional(),
    actor: actorSchema,
    /** Optional optimistic check against the campaign stream version. */
    expectedVersion: z.number().int().min(0).optional(),
    /** Human-readable reason recorded in the audit trail. */
    reason: z.string().trim().min(1).max(1000).optional(),
    command: kernelCommandSchema,
  })
  .strict()
  .superRefine((submission, context) => {
    if (submission.command.type !== 'CreateCampaign' && submission.campaignId === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['campaignId'],
        message: 'required for every command except CreateCampaign',
      });
    }
  });

export type CommandSubmission = z.infer<typeof commandSubmissionSchema>;

/** Canonical content of a validated submission, compared on duplicate command IDs. */
export function fingerprintOf(submission: CommandSubmission): string {
  return canonicalJson(submission);
}
