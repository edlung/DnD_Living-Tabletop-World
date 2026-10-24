import type { AssetFailure, AssetMediaType, AssetPurpose, AssetVariant } from '@ltw/contracts';

/**
 * The image-generation port (docs/adr/0022-asset-identity.md §3; capability
 * `image-generation`, docs/adr/0017-ai-gateway.md; generators of
 * docs/adr/0035-images.md). A generator receives a brief and returns bytes;
 * it never sees or writes the world. The brief is DM data: it is never shown
 * to players and never stored with the asset.
 */
export interface ImageBrief {
  /** Distinct per request, so every generation of an entity is its own image. */
  readonly seed: string;
  readonly subject: {
    /** The entity's stable ID: for a generator that holds images by entity (the curated set). */
    readonly entityId: string;
    readonly kind: string;
    readonly name: string;
    readonly description: string | null;
  };
  readonly variant: AssetVariant;
  /** What the image is for (ADR 0035 §4): an image, a character's figure, a place's battle map. */
  readonly purpose: AssetPurpose;
  readonly label: string | null;
  readonly note: string | null;
  /** The content hash of the canonical reference a derived variant is based on. */
  readonly basedOn: string | null;
  /**
   * The bytes of that canonical reference, for a derived variant, so that a generator can keep
   * the entity's identity (ADR 0035 §1); null for a reference, or when its bytes are not stored.
   */
  readonly reference: { readonly bytes: Uint8Array; readonly mediaType: AssetMediaType } | null;
}

/** Which job a generation belongs to: for spending records, never for the provider. */
export interface ImageJob {
  readonly campaignId: string;
  readonly requestId: string;
}

export interface GeneratedImage {
  readonly bytes: Uint8Array;
  readonly mediaType: AssetMediaType;
  readonly model: string;
}

export interface ImageGenerator {
  /** Stable provider name, recorded with every asset it produced. */
  readonly id: string;
  generate(brief: ImageBrief, signal?: AbortSignal, job?: ImageJob): Promise<GeneratedImage>;
}

/** A generation that produced no image. Carries a code and a safe message only. */
export class ImageGenerationError extends Error {
  readonly code: AssetFailure;

  constructor(code: AssetFailure, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImageGenerationError';
    this.code = code;
  }
}

/** Why a generation failed, as the asset lineage records it. */
export function imageFailureCode(error: unknown): AssetFailure {
  return error instanceof ImageGenerationError ? error.code : 'PROVIDER_ERROR';
}
