import type { KernelCommandType } from '@ltw/contracts';

import type { Actor } from './actor.ts';
import type { Rejection } from './decision.ts';
import type { WorldState } from './state.ts';

/**
 * Kernel commands are world authoring (ARCHITECTURE_INVARIANTS.md #3): only
 * the campaign's DM or a trusted system process may issue them. Any user may
 * create a campaign and becomes its DM. Runs before any state is inspected,
 * so unauthorized actors learn nothing about the campaign's contents.
 */
export function authorize(
  state: WorldState,
  actor: Actor,
  commandType: KernelCommandType,
): Rejection | null {
  if (commandType === 'CreateCampaign') {
    return actor.kind === 'user'
      ? null
      : { code: 'FORBIDDEN', message: 'A campaign is created by the user who will be its DM' };
  }
  if (actor.kind === 'system' || actor.actorId === state.campaign?.dmActorId) {
    return null;
  }
  return { code: 'FORBIDDEN', message: `Only the campaign DM may issue ${commandType}` };
}
