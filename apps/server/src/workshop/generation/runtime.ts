import type {
  AiAttemptView,
  CampaignGenerationAvailability,
  CampaignGenerationStage,
  CampaignPackage,
} from '@ltw/contracts';
import type { OutputCheck, StructuredOutputSpec } from '@ltw/ai';

import type { CampaignGenerationRepository, GenerationLease } from './store.ts';

export type CampaignPreparationStage = CampaignGenerationStage | 'edit';

export interface PreparationPayload {
  readonly system: string;
  readonly prompt: string;
  readonly output: StructuredOutputSpec;
}
export interface CampaignPreparationResult {
  readonly status: 'GENERATED' | 'AI_UNAVAILABLE' | 'INVALID_OUTPUT' | 'DISPATCH_UNKNOWN';
  readonly value: CampaignPackage | null;
  readonly traceId: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly issues: readonly string[];
  readonly attempts: readonly AiAttemptView[];
}
export interface PreparedCampaignRun {
  readonly provider: string;
  readonly model: string;
  run(
    input: PreparationPayload & {
      readonly stage: CampaignPreparationStage;
      readonly traceId: string;
      readonly signal: AbortSignal;
      readonly validate: (output: unknown) => OutputCheck<CampaignPackage>;
    },
  ): Promise<CampaignPreparationResult>;
}
export interface CampaignPreparationRuntime {
  availability(ownerId: string): Promise<CampaignGenerationAvailability>;
  forJob(lease: GenerationLease): Promise<PreparedCampaignRun | null>;
  trace?(ownerId: string, draftId: string, traceId: string): Promise<unknown>;
}
export interface CampaignGenerationDependencies {
  readonly repository: CampaignGenerationRepository;
  readonly preparation: CampaignPreparationRuntime;
}
