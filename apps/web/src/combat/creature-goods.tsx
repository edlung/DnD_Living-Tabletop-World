import type { InventoryResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useLiveRefresh } from '../api/live-context.ts';
import { useResource } from '../api/resource.ts';
import { GiveItemForm } from '../items/give-item-form.tsx';
import { useRereadOn } from '../world/use-world-data.ts';

/**
 * What a creature carries, for the DM, and an item from the catalog given to it
 * (docs/adr/0057-encounters-maps-loot.md §7): its things lie where the fight was once it is over,
 * if it fell — for the party to take.
 */
export function CreatureGoods({
  api,
  entityId,
  locked,
}: {
  readonly api: WorldApi;
  readonly entityId: string;
  readonly locked: boolean;
}) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<InventoryResponse>(`entities/${encodeURIComponent(entityId)}/inventory`, signal),
    [api, entityId],
  );
  const { resource, reread } = useResource(`goods:${entityId}`, load);
  useRereadOn(useLiveRefresh(), reread);
  const items = resource.status === 'ready' ? resource.value.items : [];
  return (
    <div className="creature-goods">
      <p className="muted">
        {items.length === 0
          ? t('It carries nothing.')
          : t('It carries: {items}.', {
              items: items
                .map((one) =>
                  one.quantity > 1
                    ? t('{item}, {count}', { item: one.name, count: one.quantity })
                    : one.name,
                )
                .join('; '),
            })}
      </p>
      <p className="fine-print">
        {t('If it falls, what it carries lies here once the fight is over.')}
      </p>
      <GiveItemForm api={api} holderId={entityId} locked={locked} />
    </div>
  );
}
