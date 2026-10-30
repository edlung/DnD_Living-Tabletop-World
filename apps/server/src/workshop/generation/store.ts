import type {
  CampaignPackage,
  CampaignGenerationJob,
  CampaignGenerationStep,
  CampaignGenerationCandidate,
  CampaignRevision,
  CampaignGenerationProgressView,
  CampaignEditSpec,
} from '@ltw/contracts';

export type GenerationMode = 'GENERATE' | 'EDIT';

export interface GenerationScope {
  readonly ownerId: string;
  readonly draftId: string;
  readonly mode?: GenerationMode;
}
export interface GenerationJobScope extends GenerationScope {
  readonly jobId: string;
}
export interface GenerationLease extends GenerationJobScope {
  readonly workerId: string;
  readonly fence: string;
  readonly authSessionId: string;
}
export interface StoredGenerationJob extends CampaignGenerationJob {
  readonly mode: GenerationMode;
  readonly lockVersion: number;
  readonly editSpec: CampaignEditSpec | null;
  readonly ownerId: string;
  readonly authSessionId: string;
  readonly seed: CampaignPackage;
  readonly requestId: string;
  readonly fence: string;
  readonly workerId: string | null;
  readonly leaseUntil: string | null;
  readonly retryOf: string | null;
}
export interface EnqueueGeneration extends GenerationScope {
  readonly authSessionId: string;
  readonly requestId: string;
  readonly basedOnRevision: number;
  readonly seed: CampaignPackage;
  readonly lockVersion?: number;
}
export interface EnqueueEdit extends EnqueueGeneration {
  readonly editSpec: CampaignEditSpec;
}
export interface GenerationStepInput {
  readonly ordinal: number;
  readonly input: CampaignPackage;
  readonly prompt: string;
  readonly provider: string;
  readonly model: string;
  readonly traceId: string;
}
export interface StoredGenerationStep extends CampaignGenerationStep {
  readonly input: CampaignPackage;
  readonly prompt: string;
  readonly inputDigest: string;
  readonly providerRequestId: string | null;
}
export type JobMutation =
  | { readonly kind: 'saved'; readonly job: StoredGenerationJob }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'conflict' };
export type LeaseMutation =
  { readonly kind: 'saved'; readonly job: StoredGenerationJob } | { readonly kind: 'fenced' };
export type GenerationClaim =
  | { readonly kind: 'claimed'; readonly job: StoredGenerationJob; readonly lease: GenerationLease }
  | { readonly kind: 'unavailable' };
export interface CampaignGenerationRepository {
  readonly mode: GenerationMode;
  enqueue(input: EnqueueGeneration): Promise<JobMutation>;
  enqueueEdit(input: EnqueueEdit): Promise<JobMutation>;
  retry(scope: GenerationJobScope, requestId: string, authSessionId: string): Promise<JobMutation>;
  requestById(scope: GenerationScope, requestId: string): Promise<StoredGenerationJob | null>;
  get(scope: GenerationJobScope): Promise<StoredGenerationJob | null>;
  progress(scope: GenerationJobScope): Promise<CampaignGenerationProgressView | null>;
  list(
    scope: GenerationScope,
    limit: number,
    before?: Pick<CampaignGenerationJob, 'createdAt' | 'jobId'> | null,
  ): Promise<readonly CampaignGenerationJob[]>;
  /** Trusted scheduler discovery returns scopes only; every subsequent operation is qualified. */
  pending(limit: number): Promise<readonly GenerationJobScope[]>;
  steps(scope: GenerationJobScope): Promise<readonly StoredGenerationStep[]>;
  candidate(scope: GenerationJobScope): Promise<CampaignGenerationCandidate | null>;
  claim(scope: GenerationJobScope, workerId: string): Promise<GenerationClaim>;
  renew(lease: GenerationLease): Promise<LeaseMutation>;
  cancel(scope: GenerationJobScope): Promise<JobMutation>;
  prepareStep(
    lease: GenerationLease,
    input: GenerationStepInput,
  ): Promise<
    | { readonly kind: 'prepared'; readonly step: StoredGenerationStep }
    | { readonly kind: 'fenced' }
    | { readonly kind: 'conflict' }
  >;
  beginDispatch(
    lease: GenerationLease,
    ordinal: number,
  ): Promise<
    | { readonly kind: 'dispatch'; readonly step: StoredGenerationStep }
    | { readonly kind: 'stored'; readonly step: StoredGenerationStep }
    | { readonly kind: 'uncertain' }
    | { readonly kind: 'fenced' }
  >;
  completeStep(
    lease: GenerationLease,
    ordinal: number,
    result: {
      readonly content: CampaignPackage;
      readonly providerRequestId: string | null;
    },
  ): Promise<
    | { readonly kind: 'stored'; readonly step: StoredGenerationStep }
    | { readonly kind: 'fenced' }
    | { readonly kind: 'conflict' }
  >;
  fail(lease: GenerationLease, code: string, dispatchUnknown?: boolean): Promise<LeaseMutation>;
  finalize(lease: GenerationLease): Promise<
    | {
        readonly kind: 'attached';
        readonly revision: CampaignRevision;
        readonly candidate: CampaignGenerationCandidate;
      }
    | { readonly kind: 'candidate'; readonly candidate: CampaignGenerationCandidate }
    | { readonly kind: 'fenced' }
    | { readonly kind: 'incomplete' }
  >;
}
