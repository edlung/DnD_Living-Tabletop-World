import { poolDice } from '../combat/port.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { KernelEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import { ownItem, played, SELF } from './handling.ts';
import { entryOf } from './records.ts';

/**
 * A magic item's charges and what its carrier knows of it (docs/adr/0054-items-as-data.md §5):
 * charges spent by using it — a Magic action — as its words allow, the DM saying what they did;
 * at dawn, every item that regains charges rolls its dice; an item's properties learnt, never its
 * curse.
 */
export function decideSpendCharges(
  state: WorldState,
  command: ResolvedCommandOf<'UseItem'>,
  spent: number,
): Decision {
  const own = ownItem(state, command.characterId, command.itemId);
  if (!own.ok) return own;
  const charges = entryOf(own.possession)?.magic?.charges;
  const left = own.possession.charges;
  if (!charges || left === undefined) return reject('INVALID_ITEM', 'It has no charges');
  if (spent > left) return reject('NO_EFFECT', 'Not that many charges left', { left });
  return played(
    state,
    command.characterId,
    SELF,
    [
      {
        type: 'ItemChargesSpent',
        payload: {
          itemId: command.itemId,
          holderId: command.characterId,
          spent,
          left: left - spent,
        },
      },
    ],
    'action',
  );
}

export function decideIdentifyItem(
  state: WorldState,
  command: ResolvedCommandOf<'IdentifyItem'>,
): Decision {
  const own = ownItem(state, command.characterId, command.itemId);
  if (!own.ok) return own;
  if (own.possession.unidentified !== true) return reject('NO_EFFECT', 'It is known already');
  return accept({
    type: 'ItemIdentified',
    payload: { itemId: command.itemId, holderId: command.characterId },
  });
}

export function decideDawnRecharge(
  state: WorldState,
  command: ResolvedCommandOf<'DawnRecharge'>,
): Decision {
  const dice = poolDice(command.resolution.entropy);
  const events: KernelEvent[] = [];
  for (const [itemId, possession] of state.possessions) {
    const charges = entryOf(possession)?.magic?.charges;
    const now = possession.charges;
    if (!charges?.regain || now === undefined || now >= charges.max) continue;
    if (state.entities.get(itemId)?.status !== 'active') continue;
    const rolls = Array.from({ length: charges.regain.count }, () =>
      dice.roll(charges.regain?.sides ?? 1),
    );
    const regained = rolls.reduce((sum, roll) => sum + roll, charges.regain.bonus);
    events.push({
      type: 'ItemChargesRegained',
      payload: {
        itemId,
        holderId: possession.holderId,
        rolls,
        regained,
        charges: Math.min(charges.max, now + regained),
      },
    });
  }
  return events.length === 0
    ? reject('NO_EFFECT', 'No magic item regains charges now')
    : accept(...events);
}
