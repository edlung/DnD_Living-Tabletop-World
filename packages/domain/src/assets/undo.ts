import type { RecordedEvent, Restore } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import { purposeField } from './records.ts';

/**
 * What undoing a picture command puts back (docs/adr/0022-asset-identity.md; ADR 0035 amendment
 * "an approval supersedes its kind"; ADR 0056 §5; docs/adr/0057-encounters-maps-loot.md §3): a
 * request removed and the portrait wish it answered, a wish as it was, an approval's pictures and
 * canonical reference as they were, a battle map's earlier grid.
 */
type Undone = Extract<
  RecordedEvent,
  { type: 'AssetRequested' | 'PortraitAsked' | 'AssetApproved' | 'BattleMapAligned' }
>;

/** An asset's record as it was before the undone event, written as the fold reads it. */
function earlier(before: WorldState, assetId: string): Restore {
  const prior = before.assets.assets.get(assetId);
  if (!prior) throw new Error(`asset ${assetId} missing before the undone command`);
  const { purpose, ...record } = structuredClone(prior);
  return { fact: 'asset', assetId, value: { ...record, ...purposeField(purpose) } };
}

export function assetRestores(before: WorldState, event: Undone): Restore[] {
  switch (event.type) {
    case 'AssetRequested':
      return [
        { fact: 'assetRequest', requestId: event.payload.requestId, value: null },
        // The wish it may have answered comes back (docs/adr/0056-characters-from-the-srd.md §5).
        {
          fact: 'portraitWish',
          characterId: event.payload.entityId,
          value: before.portraitWishes.get(event.payload.entityId) ?? null,
        },
      ];
    case 'PortraitAsked':
      return [
        {
          fact: 'portraitWish',
          characterId: event.payload.characterId,
          value: before.portraitWishes.get(event.payload.characterId) ?? null,
        },
      ];
    case 'AssetApproved': {
      const { assetId, entityId, previous, supersedes = [] } = event.payload;
      // The approved asset and every picture it superseded go back as they were.
      return [
        ...[assetId, ...(previous === null ? [] : [previous]), ...supersedes].map((id) =>
          earlier(before, id),
        ),
        { fact: 'assetCanonical', entityId, value: before.assets.canonical.get(entityId) ?? null },
      ];
    }
    case 'BattleMapAligned':
      // The battle map's record as it was, its earlier grid with it.
      return [earlier(before, event.payload.assetId)];
  }
}
