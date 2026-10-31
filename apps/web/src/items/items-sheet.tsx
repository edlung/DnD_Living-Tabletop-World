import type { InventoryItem, InventoryResponse } from '@ltw/contracts';
import { StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useCallback, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Sheet } from '../shell/sheet.tsx';
import type { Shell } from '../shell/use-shell.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import type { ItemCommandBody } from './item-command.ts';
import { ItemRow } from './item-row.tsx';
import { formatWeight } from './item-text.ts';

export interface Recipient {
  readonly entityId: string;
  readonly name: string;
}

/**
 * The Items sheet (docs/adr/0039-item-possession.md): what the acting character carries and
 * wears, with the actions the World Engine allows (wear, take off, use, give, drop). Only the
 * character's own pack is ever read; every action is checked again by the World Engine.
 */
export function ItemsSheet({
  api,
  shell,
  revision,
  characterId,
  canAct,
  locked,
  inEncounter,
  recipients,
  onRun,
}: {
  readonly api: WorldApi;
  readonly shell: Shell;
  readonly revision: number;
  /** The acting character; null in a perspective that carries nothing (the DM, a party view). */
  readonly characterId: string | null;
  readonly canAct: boolean;
  readonly locked: boolean;
  readonly inEncounter: boolean;
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
  const [shownFor, setShownFor] = useState<string | null>(null);
  const inventory = resource.status === 'ready' ? resource.value : null;
  const worn = inventory?.items.filter((item) => item.slot !== null) ?? [];
  const carried = inventory?.items.filter((item) => item.slot === null) ?? [];
  const blocked = !canAct || locked || inEncounter;
  const run = (body: ItemCommandBody) => {
    if (characterId === null) return;
    onRun({ kind: 'command', command: { characterId, ...body } });
  };
  const list = (items: readonly InventoryItem[], label: string, id: string) =>
    items.length === 0 ? null : (
      <section className="sheet-section" aria-labelledby={id}>
        <h3 id={id}>{label}</h3>
        <ul className="item-list">
          {items.map((item) => (
            <ItemRow
              key={item.itemId}
              item={item}
              language={language}
              blocked={blocked}
              recipients={recipients}
              expanded={shownFor === item.itemId}
              onToggle={() => {
                setShownFor(shownFor === item.itemId ? null : item.itemId);
              }}
              onRun={run}
            />
          ))}
        </ul>
      </section>
    );
  return (
    <Sheet
      id="items"
      title={t('Items')}
      glyph="use-item"
      open={shell.sheet === 'items'}
      onClose={shell.closeSheet}
    >
      {characterId === null ? (
        <p className="muted">{t('Choose a character to see what they carry.')}</p>
      ) : !inventory ? (
        <StatusPanel
          state={resource.status === 'error' ? 'error' : 'loading'}
          label={resource.status === 'error' ? resource.message : t('Loading items…')}
          onRetry={retry}
        />
      ) : (
        <div className="items">
          <p className="items-summary">
            {t('Carrying {weight} lb', { weight: formatWeight(inventory.totalWeightLb) })}
          </p>
          {inEncounter && (
            <p className="field-hint" role="note">
              {t('Items cannot be handled while an encounter runs.')}
            </p>
          )}
          {inventory.items.length === 0 && <p className="muted">{t('You carry nothing yet.')}</p>}
          {list(worn, t('Worn'), 'items-worn')}
          {list(carried, t('Carried'), 'items-carried')}
        </div>
      )}
    </Sheet>
  );
}
