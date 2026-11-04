import { COINAGES, MAX_SHARERS, coinsFor, splitWorth } from '@ltw/contracts';

import { isCombatant } from '../combat/records.ts';
import type { Premise } from '../investigation/events.ts';
import { reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { KernelEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import { itemEntry } from './catalog.ts';
import { mayHandle, played } from './handling.ts';
import { carriedBy, isPartyCharacter, possessionOf } from './records.ts';

/**
 * Coins shared out (docs/adr/0057-encounters-maps-loot.md §7): a member of the party, outside a
 * fight, pools each coinage it carries, gives every member named — itself too, when named — the
 * same worth in the largest coins, and keeps what does not divide. Its stacks of that coinage are
 * spent and the shares minted anew, a stack a coin; a coinage worth less than one copper each
 * is left as it is. Every other member named is of the party and here.
 */
/** The IDs a split may mint: a stack of each coin change is made in, for each member named. */
export const SPLIT_COINS_IDS = MAX_SHARERS * 7;

export function decideSplitCoins(
  state: WorldState,
  command: ResolvedCommandOf<'SplitCoins'>,
): Decision {
  const actor = mayHandle(state, command.characterId);
  if (!actor.ok) return actor;
  if (!isPartyCharacter(state, command.characterId))
    return reject('FORBIDDEN', 'Only the party shares its coins');
  if (isCombatant(state, command.characterId))
    return reject('COMBAT_ALREADY_ACTIVE', 'Coins are shared once the fight is over');
  const here = actor.value.placement?.locationId;
  const others = command.amongIds.filter((id) => id !== command.characterId);
  // Whoever is not of the party, not here or not standing: one answer for all.
  for (const id of others) {
    const member = state.entities.get(id);
    if (
      !isPartyCharacter(state, id) ||
      member?.status !== 'active' ||
      here === undefined ||
      member.placement?.locationId !== here
    )
      return reject('NOT_PRESENT', `"${id}" is not here`, { entityId: id });
  }
  const ids = [...command.resolution.ids];
  const language = state.campaign?.language === 'ru' ? 'ru' : 'en';
  const events: KernelEvent[] = [];
  for (const coinage of COINAGES) {
    const worthOf = (catalogId: string | null) =>
      coinage.find((coin) => coin.catalogId === catalogId)?.valueCp ?? 0;
    const stacks = carriedBy(state, command.characterId).flatMap((itemId) => {
      const possession = possessionOf(state, itemId);
      return possession?.slot === null &&
        worthOf(possession.catalogId) > 0 &&
        state.entities.get(itemId)?.status === 'active'
        ? [{ itemId, possession }]
        : [];
    });
    const totalCp = stacks.reduce(
      (sum, { possession }) => sum + possession.quantity * worthOf(possession.catalogId),
      0,
    );
    const { shareCp, restCp } = splitWorth(totalCp, command.amongIds.length);
    if (shareCp === 0) continue;
    for (const { itemId } of stacks) {
      events.push(
        {
          type: 'ItemStackChanged',
          payload: { itemId, holderId: command.characterId, quantity: 0 },
        },
        {
          type: 'EntityStatusChanged',
          payload: { entityId: itemId, from: 'active', to: 'destroyed' },
        },
      );
    }
    const kept = (command.amongIds.includes(command.characterId) ? shareCp : 0) + restCp;
    const payees: (readonly [string, number])[] = [
      ...others.map((id) => [id, shareCp] as const),
      [command.characterId, kept] as const,
    ];
    for (const [holderId, worthCp] of payees) {
      for (const { catalogId, count } of coinsFor(coinage, worthCp)) {
        const itemId = ids.shift();
        if (itemId === undefined) return reject('INVALID_ITEM', 'Too many coins to count at once');
        const entry = itemEntry(catalogId);
        events.push(
          {
            type: 'EntityCreated',
            payload: {
              entityId: itemId,
              kind: 'item',
              name: entry?.name[language] ?? catalogId,
              description: entry?.description[language] ?? '',
              existsSince: null,
              location: null,
            },
          },
          { type: 'ItemGranted', payload: { itemId, holderId, catalogId, quantity: count } },
        );
      }
    }
  }
  if (events.length === 0) return reject('NO_EFFECT', 'There are no coins to share');
  const premises: Premise[] = [
    { kind: 'self' },
    ...others.map((entityId) => ({ kind: 'perceived' as const, entityId })),
  ];
  return played(state, command.characterId, premises, events, 'free');
}
