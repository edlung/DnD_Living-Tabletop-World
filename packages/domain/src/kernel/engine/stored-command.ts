import {
  OBJECT_ID_PATTERN,
  PLAYER_COMMAND_TYPES,
  campaignIdSchema,
  commandIdSchema,
  kernelCommandSchema,
  kernelCommandTypeSchema,
} from '@ltw/contracts';
import { z } from 'zod';

import { actorSchema } from '../actor.ts';
import { RESOLVED_ID_POOL } from '../../investigation/records.ts';
import type { ResolvedCommand } from '../decision.ts';
import type { StoredCommand } from './event-store.ts';

const resolutionSchema = z
  .object({
    ids: z.array(z.string().regex(OBJECT_ID_PATTERN)).max(RESOLVED_ID_POOL),
    d20: z.number().int().min(1).max(20).nullable(),
  })
  .strict();
const PLAYER_TYPES: ReadonlySet<string> = new Set(PLAYER_COMMAND_TYPES);

/**
 * A stored command must carry the IDs and draws the engine resolved before
 * deciding. Player commands carry them in `resolution`, which submissions
 * can never contain (the submission schema is strict).
 */
const resolvedCommandSchema = z.looseObject({ type: z.string() }).transform((raw, context) => {
  const { resolution, ...rest } = raw;
  const command = kernelCommandSchema.safeParse(rest);
  if (!command.success) {
    command.error.issues.forEach((issue) => {
      context.addIssue({ ...issue });
    });
    return z.NEVER;
  }
  const value = command.data;
  const resolved =
    (value.type !== 'CreateEntity' || value.entityId !== undefined) &&
    (value.type !== 'StartScene' || value.sceneId !== undefined) &&
    (value.type !== 'AddKnowledge' || value.knowledgeId !== undefined) &&
    (value.type !== 'RecordMemory' || value.memoryId !== undefined) &&
    (value.type !== 'StartSession' || value.sessionId !== undefined) &&
    (value.type !== 'AddClue' || value.clueId !== undefined);
  if (!resolved) {
    context.addIssue({ code: 'custom', message: 'stored commands must have resolved IDs' });
    return z.NEVER;
  }
  if (!PLAYER_TYPES.has(value.type)) {
    if (resolution !== undefined)
      context.addIssue({ code: 'custom', message: 'unexpected resolution' });
    return value as ResolvedCommand;
  }
  const parsed = resolutionSchema.safeParse(resolution);
  if (!parsed.success) {
    context.addIssue({ code: 'custom', message: 'player commands must carry their resolution' });
    return z.NEVER;
  }
  return { ...value, resolution: parsed.data } as ResolvedCommand;
});

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
