import type { AssetFailure, AssetMediaType } from '@ltw/contracts';
import type { ImageExecution } from '@ltw/ai';

import type { DraftImageInput, DraftImagePreparation } from './draft-input.ts';
import type { DraftImageLease } from '../workshop/images/store.ts';

export interface DraftImageAvailability {
  readonly available: boolean;
  readonly provider: string | null;
  readonly model: string | null;
  readonly reason: 'READY' | 'NO_ROUTE' | 'NO_POLICY' | 'UNAVAILABLE';
}
export type DraftImagePreparationResult =
  | {
      readonly status: 'PREPARED';
      readonly input: DraftImageInput;
      readonly provider: string;
      readonly model: string;
      readonly requestDigest: string;
    }
  | { readonly status: 'UNAVAILABLE'; readonly reason: string };
export interface DraftImageRunResult {
  readonly status: 'GENERATED' | 'UNAVAILABLE' | 'REFUSED' | 'FAILED' | 'DISPATCH_UNKNOWN';
  readonly bytes: Uint8Array | null;
  readonly mediaType: AssetMediaType | null;
  readonly provider: string;
  readonly model: string;
  readonly execution: ImageExecution | null;
  readonly failure: AssetFailure | null;
}
export interface PreparedDraftImage {
  readonly provider: string;
  readonly model: string;
  run(input: {
    readonly input: DraftImageInput;
    readonly chargeId: string;
    readonly signal: AbortSignal;
    readonly beforeDispatch: (proof: {
      readonly chargeId: string;
      readonly requestDigest: string;
    }) => Promise<boolean>;
  }): Promise<DraftImageRunResult>;
}
export interface DraftImageRuntime {
  availability(ownerId: string): Promise<DraftImageAvailability>;
  prepare(input: DraftImagePreparation): Promise<DraftImagePreparationResult>;
  forJob(lease: DraftImageLease): Promise<PreparedDraftImage | null>;
}
