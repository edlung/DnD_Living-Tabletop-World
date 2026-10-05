import type { PlayerAssetView } from '@ltw/contracts';
import { useEffect, useState } from 'react';

import type { WorldApi } from '../api/client.ts';

/** Fetch approved content with authorization; revoke URLs on scope/asset change. */
export function SceneImage({
  api,
  image,
  name,
}: {
  readonly api: WorldApi;
  readonly image: PlayerAssetView | null;
  readonly name: string;
}) {
  const [loaded, setLoaded] = useState<{ hash: string; url: string } | null>(null);
  useEffect(() => {
    if (!image) return;
    const controller = new AbortController();
    let url: string | undefined;
    let live = true;
    void api.image(image.contentHash, controller.signal).then(
      (blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setLoaded({ hash: image.contentHash, url });
      },
      () => {
        /* The neutral fallback does not invent a scene. */
      },
    );
    return () => {
      live = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [api, image]);
  return loaded && loaded.hash === image?.contentHash ? (
    <img className="scene-image" src={loaded.url} alt={name} />
  ) : (
    <div className="scene-art-placeholder" aria-label="No scene image available">
      <span aria-hidden="true">◇</span>
      <small>Scene image unavailable</small>
    </div>
  );
}
