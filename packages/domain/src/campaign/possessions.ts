import { entityReference, error, type PlanContext } from './context.ts';
import { itemEntry } from '../items/catalog.ts';

/**
 * Starting possessions (docs/adr/0039-item-possession.md, Stage 470): each row ties one `item`
 * entity to the character or NPC that carries it. The compiler refuses what the World Engine's
 * `GrantItem` would refuse, so a ready package never fails on activation.
 */
export function validatePossessions(context: PlanContext): void {
  const seen = new Set<string>();
  for (const [index, row] of (context.content.possessions ?? []).entries()) {
    const path = `possessions.${index}`;
    const item = entityReference(context, row.item, `${path}.item`, ['item']);
    const holder = entityReference(context, row.holder, `${path}.holder`, ['character', 'npc']);
    if (seen.has(row.item))
      error(context, 'POSSESSION_DUPLICATE', `${path}.item`, 'An item has one starting holder');
    seen.add(row.item);
    if (item?.placement)
      error(
        context,
        'POSSESSION_PLACED',
        `${path}.item`,
        'A carried item has no placement; remove it, or drop the possession',
      );
    if (item && item.status !== 'active')
      error(context, 'POSSESSION_INACTIVE', `${path}.item`, 'A carried item must be active');
    if (holder && holder.status !== 'active')
      error(context, 'POSSESSION_HOLDER_INACTIVE', `${path}.holder`, 'The holder must be active');
    if (row.catalog !== undefined) {
      const entry = itemEntry(row.catalog);
      if (!entry)
        error(context, 'CATALOG_UNKNOWN', `${path}.catalog`, `Unknown catalog item ${row.catalog}`);
      else if (row.quantity > 1 && !entry.stackable)
        error(
          context,
          'POSSESSION_QUANTITY',
          `${path}.quantity`,
          'Only a stackable item has a quantity',
        );
    } else if (row.quantity > 1)
      error(context, 'POSSESSION_QUANTITY', `${path}.quantity`, 'A quantity needs a catalog item');
  }
}
