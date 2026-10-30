// Public campaign authoring contracts. Internal feature files import directly.
export {
  CAMPAIGN_PACKAGE_VERSION,
  campaignBriefSchema,
  campaignEntitySchema,
  campaignKnowledgeSchema,
  campaignPackageSchema,
  type CampaignPackage,
  type CampaignEntity,
  type CampaignKnowledge,
  type CampaignScope,
  type CampaignIdentities,
  type CampaignFinding,
  type CampaignAssessment,
} from './package.ts';
export {
  campaignKeySchema,
  campaignClueSchema,
  campaignConflictSchema,
  campaignSituationSchema,
  campaignEncounterSchema,
  campaignVisualBriefSchema,
} from './story.ts';
export {
  campaignRevisionNumberSchema,
  saveCampaignRevisionSchema,
  campaignRevisionQuerySchema,
  type CampaignRevisionSource,
  type CampaignRevision,
  type CampaignRevisionView,
  type CampaignRevisionSummary,
} from './revisions.ts';
export {
  CAMPAIGN_GENERATION_STATUSES,
  enqueueCampaignGenerationSchema,
  retryCampaignGenerationSchema,
  type CampaignGenerationStatus,
  type CampaignGenerationJob,
  type CampaignGenerationStep,
  type CampaignGenerationCandidate,
  type CampaignGenerationView,
  type CampaignGenerationAvailability,
  type CampaignGenerationProgressStep,
  type CampaignGenerationProgressView,
} from './generation-jobs.ts';
export {
  CAMPAIGN_GENERATION_STAGES,
  campaignGenerationStageSchema,
  campaignGenerationOutputSchemas,
  type CampaignGenerationStage,
  type CampaignGenerationOutputByStage,
} from './generation.ts';
