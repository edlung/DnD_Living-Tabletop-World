import type {
  DraftImageCandidate,
  DraftImageJob,
  DraftImageSlot,
  DraftVisualManifest,
  AssetMediaType,
} from '@ltw/contracts';
import type { DraftImageInput } from '../../images/draft-input.ts';

export interface DraftImageScope {
  readonly ownerId: string;
  readonly draftId: string;
}
export interface DraftImageJobScope extends DraftImageScope {
  readonly jobId: string;
}
export interface DraftImageLease extends DraftImageJobScope {
  readonly authSessionId: string;
  readonly workerId: string;
  readonly fence: string;
  readonly chargeId: string;
}
export interface StoredDraftImageJob extends DraftImageJob {
  readonly requestId: string;
  readonly expectedManifestVersion: number;
  readonly ownerId: string;
  readonly draftId: string;
  readonly authSessionId: string;
  readonly input: DraftImageInput;
  readonly packageDigest: string;
  readonly sourceSignature: string;
  readonly provider: string;
  readonly model: string;
  readonly requestDigest: string;
  readonly fence: string;
  readonly workerId: string | null;
  readonly leaseUntil: string | null;
  readonly chargeId: string | null;
}
/** Trusted preparation output only. HTTP never supplies input/signatures/provider/digests. */
export interface RequestDraftImage extends DraftImageScope {
  readonly requestId: string;
  readonly authSessionId: string;
  readonly revision: number;
  readonly packageDigest: string;
  readonly expectedManifestVersion: number;
  readonly input: DraftImageInput;
  readonly sourceSignature: string;
  readonly provider: string;
  readonly model: string;
  readonly requestDigest: string;
}
export interface SelectDraftImage extends DraftImageScope, DraftImageSlot {
  readonly authSessionId: string;
  readonly requestId: string;
  readonly revision: number;
  readonly packageDigest: string;
  readonly expectedManifestVersion: number;
  readonly candidateId: string | null;
}
export type ImageJobMutation =
  | { readonly kind: 'saved'; readonly job: StoredDraftImageJob }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'conflict' };
export interface DraftImageRepository {
  request(input: RequestDraftImage): Promise<ImageJobMutation>;
  requestById(scope: DraftImageScope, requestId: string): Promise<StoredDraftImageJob | null>;
  get(scope: DraftImageJobScope): Promise<StoredDraftImageJob | null>;
  list(
    scope: DraftImageScope,
    revision: number,
    limit: number,
    before?: Pick<DraftImageJob, 'createdAt' | 'jobId'> | null,
  ): Promise<readonly DraftImageJob[]>;
  pending(limit: number): Promise<readonly DraftImageJobScope[]>;
  claim(
    scope: DraftImageJobScope,
    workerId: string,
  ): Promise<
    | {
        readonly kind: 'claimed';
        readonly job: StoredDraftImageJob;
        readonly lease: DraftImageLease;
      }
    | { readonly kind: 'unavailable' }
  >;
  renew(lease: DraftImageLease): Promise<boolean>;
  beginDispatch(
    lease: DraftImageLease,
    proof: { readonly chargeId: string; readonly requestDigest: string },
  ): Promise<'DISPATCH' | 'STORED' | 'UNKNOWN' | 'FENCED'>;
  complete(
    lease: DraftImageLease,
    result: {
      readonly bytes: Uint8Array;
      readonly mediaType: AssetMediaType;
      readonly model: string;
    },
  ): Promise<
    | { readonly kind: 'stored'; readonly candidate: DraftImageCandidate }
    | { readonly kind: 'fenced' }
    | { readonly kind: 'conflict' }
  >;
  fail(lease: DraftImageLease, code: string, uncertain?: boolean): Promise<boolean>;
  cancel(scope: DraftImageJobScope): Promise<ImageJobMutation>;
  candidate(scope: DraftImageScope, candidateId: string): Promise<DraftImageCandidate | null>;
  candidates(
    scope: DraftImageScope,
    revision: number,
    limit: number,
    before?: Pick<DraftImageCandidate, 'createdAt' | 'candidateId'> | null,
    entityId?: string,
  ): Promise<readonly DraftImageCandidate[]>;
  manifest(scope: DraftImageScope, revision: number): Promise<DraftVisualManifest | null>;
  select(
    input: SelectDraftImage,
  ): Promise<
    | { readonly kind: 'saved'; readonly manifest: DraftVisualManifest }
    | { readonly kind: 'not-found' }
    | { readonly kind: 'conflict' }
  >;
  content(
    scope: DraftImageScope,
    hash: string,
  ): Promise<{ readonly bytes: Uint8Array; readonly mediaType: AssetMediaType } | null>;
}
