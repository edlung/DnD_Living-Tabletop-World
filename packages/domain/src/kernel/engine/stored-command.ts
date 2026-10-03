import {
  campaignIdSchema,
  commandIdSchema,
  kernelCommandSchema,
  kernelCommandTypeSchema,
} from '@ltw/contracts';
import { z } from 'zod';

import { actorSchema } from '../actor.ts';
import type { ResolvedCommand } from '../decision.ts';
import type { StoredCommand } from './event-store.ts';

/** A stored command must carry the IDs the engine resolved before deciding. */
const resolvedCommandSchema = kernelCommandSchema
  .refine(
    (command) =>
      (command.type !== 'CreateEntity' || command.entityId !== undefined) &&
      (command.type !== 'StartScene' || command.sceneId !== undefined),
    'stored commands must have resolved IDs',
  )
  .transform((command) => command as ResolvedCommand);

const storedCommandSchema = z
  .object({
    commandId: commandIdSchema,
    campaignId: campaignIdSchema,
    commandType: kernelCommandTypeSchema,
    actor: actorSchema,
    fingerprint: z.string().min(2),
    command: resolvedCommandSchema,
    reason: z.string().nullable(),
    firstSequence: z.number().int().min(1),
    lastSequence: z.number().int().min(1),
    recordedAt: z.iso.datetime(),
  })
  .strict()
  .refine((stored) => stored.lastSequence >= stored.firstSequence, 'invalid sequence range')
  .refine((stored) => stored.command.type === stored.commandType, 'command type mismatch');

/** Validates a stored command record (for example a database row) before use. */
export function parseStoredCommand(raw: unknown): StoredCommand {
  return storedCommandSchema.parse(raw);
}
