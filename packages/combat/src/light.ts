import type { KernelCommandOf } from '@ltw/contracts';
import { accept, reject, type Decision, type DecisionContext } from '@ltw/domain';

import { encounterOf } from './battlefield.ts';

/**
 * The DM sets a running fight's light (docs/adr/0050-the-world-around.md §1): the light everywhere
 * — a torch put out, the dawn. Squares the battlefield lights otherwise keep their own.
 */
export function decideSetLight(
  context: DecisionContext,
  command: KernelCommandOf<'SetLight'>,
): Decision {
  const found = encounterOf(context.state);
  if (!found.ok) return found;
  const encounter = found.value;
  if ((encounter.battlefield.ambient ?? 'bright') === command.ambient) {
    return reject('NO_EFFECT', 'The light is already so');
  }
  return accept({
    type: 'LightSet',
    payload: { encounterId: encounter.encounterId, ambient: command.ambient },
  });
}
