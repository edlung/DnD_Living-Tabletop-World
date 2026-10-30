import {
  campaignBriefSchema,
  campaignPackageSchema,
  CAMPAIGN_GENERATION_STATUSES,
  workshopIdSchema,
} from '@ltw/contracts';
import { z } from 'zod';

const id = workshopIdSchema;
const time = z.iso.datetime();
const number = z.number().int().min(0).max(1_000_000);
export const draftSchema = z
  .object({
    draftId: id,
    title: z.string().min(1).max(120),
    language: z.enum(['ru', 'en']),
    createdAt: time,
  })
  .strict();
const source = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('OWNER'), actorId: z.string() }).strict(),
  z
    .object({
      kind: z.literal('AI'),
      jobId: z.string(),
      traceId: z.string(),
      provider: z.string(),
      model: z.string(),
    })
    .strict(),
]);
export const assessmentSchema = z
  .object({
    compilerVersion: z.literal(1),
    readiness: z.enum(['INCOMPLETE', 'INVALID', 'READY']),
    findings: z.array(
      z
        .object({
          severity: z.enum(['error', 'warning', 'info']),
          code: z.string(),
          path: z.string(),
          message: z.string(),
        })
        .strict(),
    ),
    counts: z
      .object({ entities: number, knowledge: number, encounters: number, quests: number })
      .strict(),
  })
  .strict();
const identities = z
  .object({
    entities: z.record(z.string(), id),
    knowledge: z.record(z.string(), id),
    clues: z.record(z.string(), id),
    encounters: z.record(z.string(), id),
    scene: id,
  })
  .strict();
const revisionSchema = z
  .object({
    draftId: id,
    revision: number,
    basedOnRevision: number,
    content: campaignPackageSchema,
    identities,
    digest: z.string(),
    source,
    createdAt: time,
  })
  .strict();
export const revisionViewSchema = z
  .object({ revision: revisionSchema.nullable(), assessment: assessmentSchema })
  .strict();
const summary = revisionSchema
  .omit({ draftId: true, content: true, identities: true })
  .extend({ title: z.string() });
export const revisionHistorySchema = z
  .object({ revisions: z.array(summary), nextBefore: number.nullable() })
  .strict();
export const jobSchema = z
  .object({
    jobId: id,
    draftId: id,
    baseRevision: number,
    status: z.enum(CAMPAIGN_GENERATION_STATUSES),
    nextStep: z.number().int().min(0).max(7),
    createdAt: time,
    updatedAt: time,
    attachedRevision: number.nullable(),
    candidateAvailable: z.boolean(),
    failureCode: z.string().nullable(),
  })
  .strict();
export const jobAnswerSchema = z.object({ job: jobSchema }).strict();
export const jobsSchema = z
  .object({ jobs: z.array(jobSchema), nextCursor: id.nullable() })
  .strict();
export const availabilitySchema = z
  .object({
    available: z.boolean(),
    reason: z.enum(['READY', 'NO_ROUTE', 'NO_PREPARATION_GRANT', 'UNAVAILABLE']),
    providers: z.array(z.string()),
  })
  .strict();
const step = z
  .object({
    ordinal: z.number().int().min(0).max(6),
    stage: z.string(),
    status: z.enum(['PREPARED', 'DISPATCHING', 'SUCCEEDED']),
    traceId: id,
    provider: z.string().nullable(),
    model: z.string().nullable(),
    createdAt: time,
    completedAt: time.nullable(),
  })
  .strict();
const candidateSummary = z
  .object({ contentDigest: z.string(), baseRevision: number, createdAt: time })
  .strict();
export const progressSchema = z
  .object({
    job: jobSchema,
    brief: campaignBriefSchema,
    steps: z.array(step),
    candidate: candidateSummary.nullable(),
  })
  .strict();
const candidate = z
  .object({
    jobId: id,
    draftId: id,
    baseRevision: number,
    content: campaignPackageSchema,
    contentDigest: z.string(),
    source,
    createdAt: time,
  })
  .strict();
export const generationViewSchema = z
  .object({
    job: jobSchema,
    steps: z.array(step.extend({ content: campaignPackageSchema.nullable() })),
    candidate: candidate.nullable(),
  })
  .strict();
export type GenerationProgress = z.infer<typeof progressSchema>;
export type RevisionHistory = z.infer<typeof revisionHistorySchema>;
