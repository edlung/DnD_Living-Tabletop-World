import type { InventoryItem } from '@ltw/contracts';

import type { WorldApi } from '../../api/client.ts';
import { useApprovedImage } from '../../visual/approved-images.ts';
import { Glyph } from '../../visual/glyph.tsx';
import { itemPictureUrl } from '../../visual/ui-kit.ts';
import { usePortrait } from '../../world/use-portrait.ts';

/** A campaign prop can have its own approved painting without an SRD catalog entry. The
 * presentation endpoint makes the same perspective and history checks as the character sheet. */
function CampaignPicture({ api, itemId }: { readonly api: WorldApi; readonly itemId: string }) {
  const picture = usePortrait(api, itemId);
  const url = useApprovedImage(picture);
  return url ? <img src={url} alt="" draggable={false} /> : <Glyph name="use-item" />;
}

export function ItemPicture({
  api,
  item,
}: {
  readonly api: WorldApi;
  readonly item: InventoryItem;
}) {
  const url = item.catalog ? itemPictureUrl(item.catalog) : null;
  if (url) return <img src={url} alt="" draggable={false} />;
  return item.unidentified ? (
    <Glyph name="use-item" />
  ) : (
    <CampaignPicture api={api} itemId={item.itemId} />
  );
}
