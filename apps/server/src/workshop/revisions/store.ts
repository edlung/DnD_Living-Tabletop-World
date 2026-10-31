import type {
  CampaignRevision,
  DraftLockSnapshot,
  DraftLockTarget,
  DraftLockConflict,
} from '@ltw/contracts';

export interface RevisionControlScope {
  readonly ownerId: string;
  readonly draftId: string;
}
export interface ReplaceDraftLocks extends RevisionControlScope {
  readonly authSessionId: string;
  readonly requestId: string;
  readonly revision: number;
  readonly packageDigest: string;
  readonly expectedLockVersion: number;
  readonly manifestVersion: number;
  readonly manifestDigest: string;
  readonly targets: readonly DraftLockTarget[];
}
export interface ReviewedRevisionWrite extends RevisionControlScope {
  readonly authSessionId: string;
  readonly requestId: string;
  readonly basedOnRevision: number;
  readonly packageDigest: string;
  readonly expectedLockVersion: number;
  readonly manifestVersion: number;
  readonly manifestDigest: string;
  readonly reviewDigest: string;
}
export interface AdoptCampaignCandidate extends ReviewedRevisionWrite {
  readonly jobId: string;
  readonly candidateDigest: string;
}
export interface RestoreCampaignRevision extends ReviewedRevisionWrite {
  readonly restoreRevision: number;
}
export type RevisionControlConflict =
  | 'REQUEST_REUSED'
  | 'STALE_REVISION'
  | 'STALE_LOCKS'
  | 'STALE_MANIFEST'
  | 'STALE_REVIEW'
  | 'LOCKED_CONTENT'
  | 'INVALID_TARGET'
  | 'INVALID_CANDIDATE';
export type ControlledRevisionResult =
  | { readonly kind: 'saved'; readonly revision: CampaignRevision }
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'conflict';
      readonly reason: RevisionControlConflict;
      readonly conflicts?: readonly DraftLockConflict[];
    };
export interface CampaignRevisionControlRepository {
  locks(scope: RevisionControlScope): Promise<DraftLockSnapshot | null>;
  replaceLocks(
    input: ReplaceDraftLocks,
  ): Promise<
    | { readonly kind: 'saved'; readonly locks: DraftLockSnapshot }
    | { readonly kind: 'not-found' }
    | { readonly kind: 'conflict'; readonly reason: RevisionControlConflict }
  >;
  adopt(input: AdoptCampaignCandidate): Promise<ControlledRevisionResult>;
  restore(input: RestoreCampaignRevision): Promise<ControlledRevisionResult>;
}
