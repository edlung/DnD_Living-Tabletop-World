import type {
  CampaignPackage,
  CampaignRevision,
  CampaignRevisionSource,
  CampaignRevisionSummary,
} from '@ltw/contracts';

export interface AppendCampaignRevision {
  readonly ownerId: string;
  readonly draftId: string;
  readonly requestId: string;
  readonly basedOnRevision: number;
  readonly content: CampaignPackage;
  readonly source: CampaignRevisionSource;
  readonly createdAt: string;
}
export type CampaignRevisionConflict =
  'STALE_REVISION' | 'REQUEST_REUSED' | 'IDENTITY_KIND_CHANGED';
export type AppendCampaignRevisionResult =
  | { readonly kind: 'saved'; readonly revision: CampaignRevision }
  | { readonly kind: 'conflict'; readonly reason: CampaignRevisionConflict }
  | { readonly kind: 'not-found' };

/** Every method is owner-qualified, including idempotency lookup and history reads. */
export interface CampaignRevisionRepository {
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
