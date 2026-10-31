import type { CampaignPreviewEntityView, CampaignPreviewView } from '@ltw/contracts';

import { withPictureTimes, type ImageReader } from '../../visual/approved-images.ts';
import type { WorkshopClient } from '../client.ts';
import { previewEntitySchema, previewSheetSchema, previewViewSchema } from './schemas.ts';
import { previewMatches, previewQuery, type PreviewCamera, type PreviewScope } from './scope.ts';

export class DraftPreviewApi implements ImageReader {
  readonly #client: WorkshopClient;
  readonly #path: string;
  readonly #scope: PreviewScope;
  constructor(client: WorkshopClient, draftId: string, scope: PreviewScope) {
    this.#client = client;
    this.#path = `/drafts/${draftId}/preview`;
    this.#scope = scope;
  }
  async view(camera: PreviewCamera, signal: AbortSignal): Promise<CampaignPreviewView> {
    const result = await this.#client.request(
      `${this.#path}?${previewQuery(this.#scope, camera)}`,
      previewViewSchema,
      { signal },
    );
    if (result.kind !== 'ready' || !previewMatches(this.#scope, result.value))
      throw new Error('PREVIEW_UNAVAILABLE');
    if (result.value.scene) {
      if (result.value.scene.perspective !== this.#perspective())
        throw new Error('PREVIEW_UNAVAILABLE');
      withPictureTimes(result.value.scene);
    }
    return result.value;
  }
  async entity(entityId: string, signal: AbortSignal): Promise<CampaignPreviewEntityView> {
    const result = await this.#client.request(
      `${this.#path}/entities/${encodeURIComponent(entityId)}?${previewQuery(this.#scope)}`,
      previewEntitySchema,
      { signal },
    );
    if (result.kind !== 'ready' || !previewMatches(this.#scope, result.value))
      throw new Error('PREVIEW_UNAVAILABLE');
    if (
      result.value.entity.entityId !== entityId ||
      result.value.presentation.perspective !== this.#perspective()
    )
      throw new Error('PREVIEW_UNAVAILABLE');
    withPictureTimes(result.value.presentation);
    return result.value;
  }
  async sheet(entityId: string, signal: AbortSignal) {
    const result = await this.#client.request(
      `${this.#path}/entities/${encodeURIComponent(entityId)}/sheet?${previewQuery(this.#scope)}`,
      previewSheetSchema,
      { signal },
    );
    if (result.kind === 'missing') return null;
    if (
      result.kind !== 'ready' ||
      result.value.revision !== this.#scope.revision ||
      result.value.perspective !== this.#perspective() ||
      result.value.entity.entityId !== entityId
    )
      throw new Error('PREVIEW_UNAVAILABLE');
    return result.value;
  }
  async image(hash: string, signal: AbortSignal): Promise<Blob> {
    const result = await this.#client.bytes(
      `${this.#path}/content/${encodeURIComponent(hash)}?${previewQuery(this.#scope)}`,
      signal,
    );
    if (result.kind !== 'ready') throw new Error('PREVIEW_IMAGE_UNAVAILABLE');
    return result.value;
  }

  #perspective(): string {
    return this.#scope.perspective === 'OWNER' ? 'DM' : `CHARACTER:${this.#scope.characterId}`;
  }
}
