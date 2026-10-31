import type {
  CampaignPackage,
  CampaignRevision,
  CampaignRevisionSource,
  CampaignRevisionSummary,
} from '@ltw/contracts';
import type { CampaignIdentityRecord } from './identities.ts';

export interface AppendCampaignRevision {
  readonly ownerId: string;
  readonly draftId: string;
  readonly requestId: string;
  readonly basedOnRevision: number;
  readonly content: CampaignPackage;
  readonly source: CampaignRevisionSource;
  readonly createdAt: string;
  readonly expectedLockVersion?: number;
  readonly expectedManifestVersion?: number | undefined;
  readonly expectedManifestDigest?: string | undefined;
  readonly writePolicy?: {
    readonly operation: 'MANUAL' | 'GENERATION' | 'ADOPTION' | 'RESTORE';
    readonly intent: Readonly<Record<string, unknown>>;
  };
}
export type CampaignRevisionConflict =
  | 'STALE_REVISION'
  | 'REQUEST_REUSED'
  | 'IDENTITY_KIND_CHANGED'
  | 'STALE_LOCKS'
  | 'LOCKED_CONTENT'
  | 'STALE_MANIFEST';
export type AppendCampaignRevisionResult =
  | { readonly kind: 'saved'; readonly revision: CampaignRevision }
  | { readonly kind: 'conflict'; readonly reason: CampaignRevisionConflict }
  | { readonly kind: 'not-found' };

/** Every method is owner-qualified, including idempotency lookup and history reads. */
export interface CampaignRevisionRepository {
  /** Private server-only retained aliases needed by this candidate, never an HTTP projection. */
  identityRecords(
    ownerId: string,
    draftId: string,
    content: CampaignPackage,
  ): Promise<readonly CampaignIdentityRecord[]>;
  append(input: AppendCampaignRevision): Promise<AppendCampaignRevisionResult>;
  latest(ownerId: string, draftId: string): Promise<CampaignRevision | null>;
  get(ownerId: string, draftId: string, revision: number): Promise<CampaignRevision | null>;
  list(
    ownerId: string,
    draftId: string,
    before: number | null,
    limit: number,
  ): Promise<readonly CampaignRevisionSummary[]>;
}
