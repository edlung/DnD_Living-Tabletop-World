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
import { ENTROPY_POOL } from '../../combat/port.ts';
import { MAX_RESOLVED_IDS } from '../../combat/reactions.ts';
import type { ResolvedCommand } from '../decision.ts';
import type { StoredCommand } from './event-store.ts';

const resolutionSchema = z
  .object({
    ids: z.array(z.string().regex(OBJECT_ID_PATTERN)).max(MAX_RESOLVED_IDS),
    d20: z.number().int().min(1).max(20).nullable(),
    /** Absent in commands stored before combat existed (Stage 60). */
    entropy: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(2 ** 32 - 1),
      )
      .max(ENTROPY_POOL)
      .default([]),
  })
  .strict();
/**
 * Commands that carry an engine resolution: player commands, StartCombat, closing a reaction
 * window, and the DM's damage or healing.
 */
const RESOLVED_TYPES: ReadonlySet<string> = new Set([
  ...PLAYER_COMMAND_TYPES,
  'StartCombat',
  'CloseReactionWindow',
  'AdjustHitPoints',
  'AddCombatant',
  'RemoveCombatant',
  'DelayTurn',
]);

/**
 * Commands resolved since a later stage, stored without a resolution before it: a condition by
 * hand, which rolls a grounded flyer's fall (docs/adr/0049-space-and-movement.md §6, Stage 640f).
 */
const LATER_RESOLVED_TYPES: ReadonlySet<string> = new Set(['SetCondition']);

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
    (value.type !== 'AddClue' || value.clueId !== undefined) &&
    (value.type !== 'StartCombat' || value.encounterId !== undefined) &&
    (value.type !== 'ApplyAuthoring' ||
      value.commands.every(
        (operation) =>
          (operation.type !== 'CreateEntity' || operation.entityId !== undefined) &&
          (operation.type !== 'AddKnowledge' || operation.knowledgeId !== undefined),
      ));
  if (!resolved) {
    context.addIssue({ code: 'custom', message: 'stored commands must have resolved IDs' });
    return z.NEVER;
  }
  if (LATER_RESOLVED_TYPES.has(value.type) && resolution === undefined) {
    return value as ResolvedCommand;
  }
  if (!RESOLVED_TYPES.has(value.type) && !LATER_RESOLVED_TYPES.has(value.type)) {
    if (resolution !== undefined)
      context.addIssue({ code: 'custom', message: 'unexpected resolution' });
    return value as ResolvedCommand;
  }
  const parsed = resolutionSchema.safeParse(resolution);
  if (!parsed.success) {
    context.addIssue({ code: 'custom', message: 'this command must carry its resolution' });
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
