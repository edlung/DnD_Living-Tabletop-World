import { createHash } from 'node:crypto';

import type { AssetMediaType } from '@ltw/contracts';

/**
 * Generated image bytes, addressed by content hash within a campaign
 * (docs/adr/0022-asset-identity.md §6). Not canonical state: the campaign's
 * asset lineage says which content belongs to which asset and who may see
 * it. Contents are append-only: storing the same bytes again is a no-op.
 */
export interface StoredContent {
  readonly bytes: Uint8Array;
  readonly mediaType: AssetMediaType;
}

export interface AssetContentStore {
  /** Stores the bytes and returns their content hash (`sha256:<hex>`). */
  put(campaignId: string, content: StoredContent): Promise<string>;
  get(campaignId: string, contentHash: string): Promise<StoredContent | null>;
}

/** Largest content accepted: 2 MiB. */
export const MAX_CONTENT_BYTES = 2 * 1024 * 1024;

export const contentHashOf = (bytes: Uint8Array): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export function checkContent(content: StoredContent): void {
  if (content.bytes.byteLength === 0 || content.bytes.byteLength > MAX_CONTENT_BYTES) {
    throw new Error(`asset content must be 1 to ${String(MAX_CONTENT_BYTES)} bytes`);
  }
}

export class InMemoryAssetContentStore implements AssetContentStore {
  readonly #contents = new Map<string, StoredContent>();

  put(campaignId: string, content: StoredContent): Promise<string> {
    checkContent(content);
    const contentHash = contentHashOf(content.bytes);
    const key = `${campaignId}|${contentHash}`;
    if (!this.#contents.has(key)) {
      this.#contents.set(key, { bytes: content.bytes.slice(), mediaType: content.mediaType });
    }
    return Promise.resolve(contentHash);
  }

  get(campaignId: string, contentHash: string): Promise<StoredContent | null> {
    const found = this.#contents.get(`${campaignId}|${contentHash}`);
    return Promise.resolve(
      found ? { bytes: found.bytes.slice(), mediaType: found.mediaType } : null,
    );
  }

  /** Test support: how many contents are stored. */
  get size(): number {
    return this.#contents.size;
  }
}
