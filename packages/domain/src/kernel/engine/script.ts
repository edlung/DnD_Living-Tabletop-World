import type { Actor } from '../actor.ts';

/**
 * Turns an ordered command script (for example a Ravenford fixture) into
 * engine submissions with deterministic command IDs, so seeding the same
 * script twice is idempotent. The engine validates every submission.
 */
export function submissionsFromScript(options: {
  readonly campaignId: string;
  readonly actor: Actor;
  readonly commands: readonly unknown[];
  readonly commandIdPrefix?: string;
}): unknown[] {
  const prefix = options.commandIdPrefix ?? `${options.campaignId}.seed`;
  return options.commands.map((command, index) => ({
    commandId: `${prefix}.${String(index + 1).padStart(4, '0')}`,
    campaignId: options.campaignId,
    actor: options.actor,
    command,
  }));
}
