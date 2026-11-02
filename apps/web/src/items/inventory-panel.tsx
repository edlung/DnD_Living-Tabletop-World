import type { EncounterView, InventoryResponse } from '@ltw/contracts';
import { StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { GiveItemForm } from './give-item-form.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import { Bag } from './inventory/bag.tsx';
import { ItemCard } from './inventory/item-card.tsx';
import { PaperDoll } from './inventory/paper-doll.tsx';
import { PurseAndLoad } from './inventory/purse.tsx';
import type { ItemCommandBody } from './item-command.ts';

export interface Recipient {
  readonly entityId: string;
  readonly name: string;
}

/**
 * The character's pack (docs/adr/0039-item-possession.md), the Inventory tab of the character
 * dialog: the purse and the load, the paper doll of what is worn and wielded, the bag, and the card
 * of the chosen item with the actions the World Engine allows (wear or wield, take off, use, give,
 * drop) — by button, or by dragging between the bag and the doll (Stage 520). Only a pack this
 * perspective may see is ever read; every action is checked again by the World Engine.
 */
export function InventoryPanel({
  api,
  revision,
  characterId,
  canAct,
  locked,
  encounter,
  recipients,
  onRun,
}: {
  readonly api: WorldApi;
  readonly revision: number;
  /** Whose pack; null in a perspective that carries nothing (a party view). */
  readonly characterId: string | null;
  readonly canAct: boolean;
  readonly locked: boolean;
  /** The encounter this perspective sees; its own turn spends the turn's actions. */
  readonly encounter: EncounterView | null;
  readonly recipients: readonly Recipient[];
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const language = useLanguage();
  const load = useCallback(
    (signal: AbortSignal) =>
      characterId === null
        ? Promise.resolve(null)
        : api.get<InventoryResponse>(
            `entities/${encodeURIComponent(characterId)}/inventory`,
            signal,
          ),
    [api, characterId],
  );
  const { resource, retry, reread } = useResource(`inventory:${characterId ?? ''}`, load);
  useRereadOn(revision, reread);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The chosen item's card comes into view below the bag (smoothly, unless motion is reduced).
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedId === null) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.current?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [selectedId]);
  const inventory = resource.status === 'ready' ? resource.value : null;
  const worn = inventory?.items.filter((item) => item.slot !== null) ?? [];
  const carried = inventory?.items.filter((item) => item.slot === null) ?? [];
  const selected = inventory?.items.find((item) => item.itemId === selectedId) ?? null;
  // In a fight a combatant acts on its own turn only (docs/adr/0039-item-possession.md, Stage 490).
  const fighting =
    characterId !== null &&
    (encounter?.combatants.some((entry) => entry.entity.entityId === characterId) ?? false);
  const myTurn = fighting && encounter?.currentCombatantId === characterId;
  const blocked = !canAct || locked || (fighting && !myTurn);
  const run = (body: ItemCommandBody) => {
    if (characterId === null) return;
    onRun({ kind: 'command', command: { characterId, ...body } });
  };
  if (characterId === null) {
    return <p className="muted">{t('Choose a character to see what they carry.')}</p>;
  }
  if (!inventory) {
    return (
      <StatusPanel
        state={resource.status === 'error' ? 'error' : 'loading'}
        label={resource.status === 'error' ? resource.message : t('Loading items…')}
        onRetry={retry}
      />
    );
  }
  const weapon = selected?.catalog?.weapon
    ? (inventory.weapons?.[selected.catalog.weapon] ?? null)
    : null;
  return (
    <div className="inventory">
      <PurseAndLoad
        items={inventory.items}
        totalWeightLb={inventory.totalWeightLb}
        capacityLb={inventory.capacityLb ?? null}
      />
      {fighting && (
        <p className="field-hint" role="note">
          {myTurn
            ? t(
                'In a fight a potion or worn gear costs your Bonus Action, a shield or any other use your Action, and handing something over a Bonus Action beside the receiver. Dropping is free; armor and picking up wait.',
              )
            : t('You can handle items on your own turn.')}
        </p>
      )}
      {inventory.items.length === 0 ? (
        <p className="muted">{t('You carry nothing yet.')}</p>
      ) : (
        <>
          <div className="inventory-layout">
            <PaperDoll
              worn={worn}
              carried={carried}
              selectedId={selectedId}
              blocked={blocked}
              onSelect={setSelectedId}
              onEquip={(itemId, slot) => {
                setSelectedId(itemId);
                run({ type: 'EquipItem', itemId, slot });
              }}
            />
            <Bag
              carried={carried}
              worn={worn}
              selectedId={selectedId}
              blocked={blocked}
              onSelect={setSelectedId}
              onUnequip={(itemId) => {
                setSelectedId(itemId);
                run({ type: 'UnequipItem', itemId });
              }}
            />
          </div>
          <div ref={card}>
            {selected ? (
              <ItemCard
                key={selected.itemId}
                item={selected}
                worn={worn}
                weapon={weapon}
                language={language}
                blocked={blocked}
                recipients={recipients}
                onRun={run}
              />
            ) : (
              <p className="inventory-choose muted">
                {t('Choose an item to see what it is and what you can do with it.')}
              </p>
            )}
          </div>
        </>
      )}
      <GiveItemForm api={api} holderId={characterId} locked={locked} />
    </div>
  );
}
