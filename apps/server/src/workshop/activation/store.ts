import type {
  CampaignActivationView,
  CampaignBootstrapAsset,
  CampaignRevision,
  DraftVisualManifest,
  OwnedCampaign,
  QuestDefinition,
  StartCampaignActivation,
} from '@ltw/contracts';

export interface ActivationScope {
  readonly ownerId: string;
  readonly draftId: string;
}
export interface ActivationOperationScope extends ActivationScope {
  readonly activationId: string;
}
export interface FrozenCampaignActivation {
  readonly revision: CampaignRevision;
  readonly manifest: DraftVisualManifest;
  readonly lockVersion: number;
  readonly lockDigest: string;
  readonly planDigest: string;
  readonly scenarioDigest: string;
  readonly questDigest: string;
  readonly reviewDigest: string;
  readonly textOnly: boolean;
  readonly readiness: 'READY';
  readonly findingIds: readonly string[];
  readonly requiredFindingIds: readonly string[];
  readonly acknowledgedFindingIds: readonly string[];
  readonly assets: readonly CampaignBootstrapAsset[];
  readonly quests: readonly QuestDefinition[];
}
export interface StoredCampaignActivation extends CampaignActivationView {
  readonly ownerId: string;
  readonly authSessionId: string;
  readonly requestId: string;
  readonly requestFingerprint: string;
  readonly bootstrapCommandId: string;
  readonly frozen: FrozenCampaignActivation;
  readonly workerId: string | null;
  readonly fence: string;
  readonly leaseUntil: string | null;
  readonly nextAttemptAt: string | null;
}
export interface ActivationLease extends ActivationOperationScope {
  readonly workerId: string;
  readonly fence: string;
}
export type ActivationConflictReason =
  | 'REQUEST_REUSED'
  | 'STALE_REVISION'
  | 'STALE_LOCKS'
  | 'STALE_MANIFEST'
  | 'STALE_REVIEW'
  | 'ACKNOWLEDGEMENTS'
  | 'NOT_READY'
  | 'ALREADY_ACTIVATED';
export type ActivationMutation =
  | { readonly kind: 'saved'; readonly activation: StoredCampaignActivation }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'conflict'; readonly reason: ActivationConflictReason };
export interface CampaignActivationRepository {
  status(scope: ActivationScope): Promise<CampaignActivationView | null>;
  get(scope: ActivationScope): Promise<StoredCampaignActivation | null>;
  byRequest(scope: ActivationScope, requestId: string): Promise<StoredCampaignActivation | null>;
  begin(
    input: ActivationScope & {
      readonly authSessionId: string;
      readonly request: StartCampaignActivation;
      readonly frozen: FrozenCampaignActivation;
    },
  ): Promise<ActivationMutation>;
  retry(scope: ActivationOperationScope, authSessionId: string): Promise<ActivationMutation>;
  pending(limit: number): Promise<readonly ActivationOperationScope[]>;
  claim(
    scope: ActivationOperationScope,
    workerId: string,
  ): Promise<{
    readonly activation: StoredCampaignActivation;
    readonly lease: ActivationLease;
  } | null>;
  renew(lease: ActivationLease): Promise<boolean>;
  phase(lease: ActivationLease, phase: 'CONTENT_READY' | 'BOOTSTRAPPED'): Promise<boolean>;
  fail(lease: ActivationLease, code: string, retryable: boolean): Promise<boolean>;
  publish(
    lease: ActivationLease,
    proof: {
      readonly fingerprint: string;
      readonly version: number;
    },
  ): Promise<boolean>;
  owned(
    ownerId: string,
    limit: number,
    before?: Pick<OwnedCampaign, 'publishedAt' | 'activationId'> | null,
  ): Promise<readonly OwnedCampaign[]>;
  ownedCampaign(ownerId: string, campaignId: string): Promise<OwnedCampaign | null>;
  ownedActivation(ownerId: string, activationId: string): Promise<OwnedCampaign | null>;
}
