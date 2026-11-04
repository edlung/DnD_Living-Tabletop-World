import { reject, accept, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { baseOfGrant, itemEntry, madeOn } from './catalog.ts';
import { carrier, item } from './handling.ts';
import { possessionOf } from './records.ts';

/**
 * Giving an item to a carrier (docs/adr/0039-item-possession.md, the DM's or a trusted process's),
 * and the refusals the DM's catalog asks before it makes the item (docs/adr/0054-items-as-data.md
 * §4–5): a carrier, a known entry, a base for a magic weapon, armor or shield, a quantity only of
 * what stacks.
 */
export function decideGrantItem(
  state: WorldState,
  command: ResolvedCommandOf<'GrantItem'>,
): Decision {
  const thing = item(state, command.itemId);
  if (!thing.ok) return thing;
  const catalogId = command.catalogId ?? null;
  const baseId = command.baseCatalogId ?? null;
  const refused = grantRefusal(state, command.holderId, catalogId, command.quantity, baseId);
  if (refused) return refused;
  if (possessionOf(state, command.itemId))
    return reject('INVALID_ITEM', `Item "${command.itemId}" already has a holder or place`);
  const entry = catalogId === null ? undefined : itemEntry(catalogId);
  const base = baseOfGrant(entry, baseId);
  // A magic item comes with its charges full (docs/adr/0054-items-as-data.md §5).
  const charges = entry?.magic?.charges?.max;
  return accept({
    type: 'ItemGranted',
    payload: {
      itemId: command.itemId,
      holderId: command.holderId,
      catalogId,
      quantity: command.quantity,
      ...(base !== null && typeof base !== 'string' ? { baseCatalogId: base.itemId } : {}),
      ...(charges === undefined ? {} : { charges }),
      ...(command.unidentified ? { unidentified: true as const } : {}),
    },
  });
}

/**
 * Why `quantity` of catalog entry `catalogId` could not go to `holderId`, or null, whatever item
 * it is: the DM's catalog asks before it makes the item (docs/adr/0054-items-as-data.md §4).
 */
export function grantRefusal(
  state: WorldState,
  holderId: string,
  catalogId: string | null,
  quantity: number,
  /** What a magic weapon, armor or shield is made on (docs/adr/0054-items-as-data.md §5). */
  baseCatalogId: string | null = null,
): (Decision & { ok: false }) | null {
  const holder = carrier(state, holderId);
  if (!holder.ok) return holder;
  const entry = catalogId === null ? undefined : itemEntry(catalogId);
  if (catalogId !== null && !entry)
    return reject('INVALID_ITEM', `Unknown catalog item "${catalogId}"`, { catalogId });
  const base = baseOfGrant(entry, baseCatalogId);
  if (typeof base === 'string') return reject('INVALID_ITEM', base, { catalogId, baseCatalogId });
  const made = entry && base ? madeOn(entry, base) : entry;
  if (quantity > 1 && !made?.stackable)
    return reject('INVALID_ITEM', 'Only a stackable catalog item can be granted in quantity');
  return null;
}
