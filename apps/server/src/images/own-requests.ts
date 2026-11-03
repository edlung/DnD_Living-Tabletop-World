import { isUploadRequest } from './battle-map-upload.ts';
import { isCuratedRequest } from './curated-import.ts';

/**
 * Picture requests the server answers itself (docs/adr/0035-images.md §3; docs/adr/0057-encounters-
 * maps-loot.md §3): the curated import's and the DM's uploaded battle maps. The asset worker never
 * starts them, so no image model is asked or paid for them.
 */
export const isOwnRequest = (requestId: string, campaignId: string): boolean =>
  isCuratedRequest(requestId, campaignId) || isUploadRequest(requestId, campaignId);
