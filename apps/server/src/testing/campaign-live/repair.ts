import { createHash } from 'node:crypto';

import type { OutputCheck } from '@ltw/ai';
import type {
  CampaignGenerationCandidate,
  CampaignGenerationJob,
  CampaignPackage,
  CampaignRevisionReview,
} from '@ltw/contracts';
import { buildCampaignEditPlan } from '@ltw/domain';
import type pg from 'pg';

import { AccountingTasks } from '../../ai/accounting-tasks.ts';
import { grantPreparationApproval } from '../../ai/accounting/preparation-sessions.ts';
import { approvalExists, PostgresBudgetStore } from '../../ai/accounting/postgres-budget-store.ts';
import { spendReport } from '../../ai/accounting/spend-report.ts';
import type { Authorization } from '../../ai/accounting/types.ts';
import { identityResolver, VERIFIED_CATALOG } from '../../ai/catalog.ts';
import { createCampaignPreparationRuntime } from '../../ai/preparation-gateway.ts';
import type { AppConfig } from '../../platform/config/config.ts';
import { CampaignEditWorker } from '../../workshop/generation/edit-worker.ts';
import { PostgresCampaignGenerationRepository } from '../../workshop/generation/postgres-store.ts';
import type { CampaignPreparationRuntime } from '../../workshop/generation/runtime.ts';
import type { GenerationJobScope } from '../../workshop/generation/store.ts';
import { generationJobView } from '../../workshop/generation/views.ts';
import { PostgresDraftImageRepository } from '../../workshop/images/postgres-store.ts';
import { campaignCanonicalJson } from '../../workshop/packages/content.ts';
import { PostgresCampaignRevisionRepository } from '../../workshop/packages/postgres-store.ts';
import { PostgresWorkshopStore } from '../../workshop/postgres-store.ts';
import { PostgresCampaignRevisionControlRepository } from '../../workshop/revisions/postgres-store.ts';
import { buildCampaignRevisionReview } from '../../workshop/revisions/review.ts';

export interface LiveCastRepairInput {
  readonly pool: pg.Pool;
  readonly aiConfig: AppConfig['ai'];
  /** Original real GENERATE job; not the new selective EDIT job. */
  readonly scope: GenerationJobScope;
  readonly authorization: Authorization;
  readonly guard: (phase: 'prepare' | 'dispatch') => Promise<void>;
  readonly write: (name: string, value: unknown) => Promise<void>;
  readonly validate?: (content: CampaignPackage) => OutputCheck<CampaignPackage>;
}
export interface LiveCastRepairResult {
  readonly job: CampaignGenerationJob;
  readonly candidate: CampaignGenerationCandidate | null;
  readonly review: CampaignRevisionReview | null;
  readonly accountingIssues: readonly string[];
}

/** Stable purpose nonce: rerunning the helper cannot silently authorize a second EDIT. */
function repairNonce(scope: GenerationJobScope): string {
  const hash = createHash('sha256')
    .update(
      JSON.stringify(['stage450-live-cast-repair-v1', scope.ownerId, scope.draftId, scope.jobId]),
    )
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function missingCast(content: CampaignPackage) {
  const present = new Set(content.entities.map((entity) => entity.key));
  const required = new Map<string, Set<string>>();
  const add = (key: string, role: string) => {
    if (present.has(key)) return;
    const roles = required.get(key) ?? new Set<string>();
    roles.add(role);
    required.set(key, roles);
  };
  const location = (key: string) => {
    if (!present.has(key)) throw new Error('LIVE_CAST_REPAIR_MISSING_LOCATION');
  };
  for (const key of content.party) add(key, 'prepared character: complete supported sheet');
  for (const item of content.relationships) add(item.npc, 'NPC: existing initial relationship');
  for (const record of content.knowledge) {
    if (record.scope.kind === 'NPC' || record.scope.kind === 'CHARACTER')
      add(
        record.scope.holder,
        record.scope.kind === 'NPC' ? 'NPC: knowledge holder' : 'character: knowledge holder',
      );
    if (record.attributedTo) add(record.attributedTo, 'NPC/character: attributed speaker');
    for (const key of record.subjects) add(key, 'knowledge subject');
  }
  for (const clue of content.clues) {
    add(clue.entity, 'discoverable clue source');
    for (const key of clue.subjects) add(key, 'clue subject');
  }
  for (const conflict of content.conflicts)
    for (const key of conflict.actors)
      add(key, 'conflict actor: NPC, character or faction as described');
  for (const situation of content.situations) {
    location(situation.location);
    for (const key of situation.participants) add(key, 'situation participant');
  }
  for (const encounter of content.encounters) {
    location(encounter.location);
    for (const participant of encounter.combatants)
      add(participant.entity, 'prepared combatant: character sheet or NPC/creature statBlock');
  }
  for (const visual of content.visuals) {
    if (visual.purpose === 'battle-map') location(visual.entity);
    else add(visual.entity, `existing ${visual.purpose} visual subject`);
  }
  for (const quest of content.quests) {
    add(quest.activation.subject, 'quest activation subject');
    for (const milestone of quest.milestones) {
      if ('locationId' in milestone) location(milestone.locationId);
      if ('subject' in milestone) add(milestone.subject, 'quest subject');
      if ('informant' in milestone) add(milestone.informant, 'quest informant: NPC');
    }
  }
  return [...required.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, roles]) => ({ key, roles: [...roles].sort() }));
}

function instruction(content: CampaignPackage): string {
  return [
    'Repair the missing cast declarations in this SAME campaign, not a new campaign or rewritten scenario.',
    'Change ONLY entities by adding the missing nonlocation entities listed below. Return the COMPLETE CampaignPackage.',
    `Preserve all ${content.entities.length} existing locations byte-for-byte in the exact original order. Keep them first; append the new nonlocation entities.`,
    'Preserve EVERY non-entities field and every array order exactly, even if the structural dependency closure includes those fields.',
    `Keep the existing ${content.party.length} prepared party keys unchanged; declare each as a distinct active character with complete supported sheets at brief.partyLevel, full HP and legal initial placement at world.startLocation.`,
    'Declare every existing relationships.npc and NPC knowledge holder as an NPC. Prepare supported NPC/creature statBlocks for existing nonparty encounter combatants.',
    'Use baseline narrative to distinguish the named faction/group, creature and boat/object. A boat is an item or feature, not a fabricated character or faction.',
    'Fulfill EVERY existing referenced local key below. Reuse these keys exactly; do not rename, delete or rewrite the references in other sections.',
    'Do not add canonical IDs, controllers, accounts, memberships, actual discoveries, played history or already-decided outcomes. Keep all supported temporal constraints.',
    JSON.stringify({ requiredMissingKeys: missingCast(content) }),
  ].join('\n');
}

function repairRuntime(
  runtime: CampaignPreparationRuntime,
  baseline: CampaignPackage,
  semantic: LiveCastRepairInput['validate'],
): CampaignPreparationRuntime {
  return {
    ...runtime,
    forJob: async (lease) => {
      const prepared = await runtime.forJob(lease);
      return prepared === null
        ? null
        : {
            ...prepared,
            run: (input) =>
              prepared.run({
                ...input,
                validate: (output) => {
                  const checked = input.validate(output);
                  if (!checked.ok) return checked;
                  if (
                    campaignCanonicalJson({ ...checked.value, entities: baseline.entities }) !==
                    campaignCanonicalJson(baseline)
                  )
                    return {
                      ok: false,
                      issues: [
                        'LIVE_CAST_REPAIR_OUTSIDE_ENTITIES: preserve every non-entities field and array order exactly',
                      ],
                    };
                  if (
                    campaignCanonicalJson(
                      checked.value.entities.filter((entity) => entity.kind === 'location'),
                    ) !== campaignCanonicalJson(baseline.entities) ||
                    campaignCanonicalJson(
                      checked.value.entities.slice(0, baseline.entities.length),
                    ) !== campaignCanonicalJson(baseline.entities)
                  )
                    return {
                      ok: false,
                      issues: [
                        'LIVE_CAST_REPAIR_LOCATIONS: preserve every original location and its order exactly',
                      ],
                    };
                  return semantic ? semantic(checked.value) : checked;
                },
              }),
          };
    },
  };
}

async function paidEvidence(
  input: LiveCastRepairInput,
  jobId: string | null,
  issues: readonly string[],
) {
  const params = [input.scope.ownerId, input.scope.draftId, jobId];
  const where = `r.subject_kind='workshop' AND r.workshop_owner_id=$1 AND r.workshop_draft_id=$2 AND r.source_ids ? $3`;
  const queries = [
    [
      'requests',
      `SELECT r.* FROM ltw_ai_requests r WHERE ${where} ORDER BY r.created_at,r.request_id`,
    ],
    [
      'attempts',
      `SELECT a.* FROM ltw_ai_attempts a JOIN ltw_ai_requests r USING(request_id) WHERE ${where} ORDER BY a.created_at,a.attempt_id`,
    ],
    [
      'accounting',
      `SELECT c.* FROM ltw_ai_accounting c JOIN ltw_ai_attempts a USING(attempt_id) JOIN ltw_ai_requests r ON r.request_id=a.request_id WHERE ${where} ORDER BY c.created_at,c.entry_id`,
    ],
    [
      'traces',
      `SELECT t.trace FROM ltw_ai_traces t JOIN ltw_ai_requests r ON r.request_id::text=t.trace_id WHERE ${where} ORDER BY t.created_at,t.trace_id`,
    ],
  ] as const;
  for (const [name, query] of queries) {
    const rows = jobId === null ? [] : (await input.pool.query(query, params)).rows;
    await input.write(`${name}.json`, rows);
  }
  await input.write('spend.json', await spendReport(input.pool));
  await input.write('accounting-issues.json', issues);
}

/** Executes only when explicitly invoked by the owner-authorized root runner. Never adopts. */
export async function runLiveCastRepair(input: LiveCastRepairInput): Promise<LiveCastRepairResult> {
  const { pool, scope, authorization, aiConfig, write } = input;
  const approvalId = aiConfig.approvalId;
  if (!approvalId || !aiConfig.anthropic || aiConfig.anthropic.model !== 'claude-sonnet-5-5')
    throw new Error('LIVE_CAST_REPAIR_MODEL_CONFIG');
  await input.guard('prepare');
  const workshop = new PostgresWorkshopStore(pool),
    packages = new PostgresCampaignRevisionRepository(pool),
    images = new PostgresDraftImageRepository(pool),
    controls = new PostgresCampaignRevisionControlRepository(pool),
    generation = new PostgresCampaignGenerationRepository(pool),
    edits = new PostgresCampaignGenerationRepository(pool, 'EDIT');
  const original = await generation.get(scope),
    baseline = await packages.latest(scope.ownerId, scope.draftId);
  if (
    !original ||
    !(await workshop.draft(scope.ownerId, scope.draftId)) ||
    original.status !== 'SUCCEEDED' ||
    original.attachedRevision !== 1 ||
    !baseline ||
    baseline.revision !== 1 ||
    baseline.source.kind !== 'AI' ||
    baseline.source.jobId !== scope.jobId ||
    !baseline.content.entities.length ||
    baseline.content.entities.some((entity) => entity.kind !== 'location')
  )
    throw new Error('LIVE_CAST_REPAIR_SOURCE_MISMATCH');
  const locks = await controls.locks(scope),
    manifest = await images.manifest(scope, baseline.revision);
  if (!locks || !manifest) throw new Error('LIVE_CAST_REPAIR_GUARDS_MISSING');
  const ownerInstruction = instruction(baseline.content);
  if (ownerInstruction.length > 8000) throw new Error('LIVE_CAST_REPAIR_INSTRUCTION_TOO_LARGE');
  const plan = buildCampaignEditPlan(baseline, locks, manifest, ownerInstruction, [
    'section:entities',
  ]);
  if (!plan.spec) throw new Error('LIVE_CAST_REPAIR_SCOPE_CONFLICT');
  const accountingIssues: string[] = [],
    tasks = new AccountingTasks((issue) => accountingIssues.push(issue));
  let granted = false,
    worker: CampaignEditWorker | null = null,
    repairJobId: string | null = null,
    result: LiveCastRepairResult | null = null,
    failed = false,
    failure: unknown;
  const cleanupIssues: string[] = [];
  try {
    await write('plan.json', plan);
    await write('source-binding.json', {
      ...scope,
      revision: baseline.revision,
      packageDigest: baseline.digest,
      requestId: repairNonce(scope),
      approvalId,
      model: 'anthropic:claude-sonnet-5-5',
      authorization,
    });
    await grantPreparationApproval(pool, {
      approvalId,
      ownerId: scope.ownerId,
      enabled: true,
      authorization,
    });
    granted = true;
    const actual = createCampaignPreparationRuntime(
      { ...aiConfig, routes: { 'campaign-preparation': ['anthropic:claude-sonnet-5-5'] } },
      {
        pool,
        budget: new PostgresBudgetStore(pool, identityResolver(VERIFIED_CATALOG)),
        catalog: VERIFIED_CATALOG,
        approvalStored: await approvalExists(pool, approvalId),
        tasks,
      },
    );
    const preparation = repairRuntime(actual, baseline.content, input.validate),
      availability = await preparation.availability(scope.ownerId);
    await write('availability.json', availability);
    if (!availability.available) throw new Error('LIVE_CAST_REPAIR_UNAVAILABLE');
    const queued = await edits.enqueueEdit({
      ownerId: scope.ownerId,
      draftId: scope.draftId,
      authSessionId: original.authSessionId,
      requestId: repairNonce(scope),
      basedOnRevision: baseline.revision,
      seed: baseline.content,
      lockVersion: locks.version,
      editSpec: plan.spec,
    });
    if (queued.kind !== 'saved') throw new Error('LIVE_CAST_REPAIR_ENQUEUE_CONFLICT');
    repairJobId = queued.job.jobId;
    const repairScope = { ownerId: scope.ownerId, draftId: scope.draftId, jobId: repairJobId };
    await write('job.json', generationJobView(queued.job));
    await input.guard('dispatch');
    worker = new CampaignEditWorker({ repository: edits, preparation, packages });
    await worker.run(repairScope);
    await tasks.idle();
    const job = await edits.get(repairScope),
      candidate = await edits.candidate(repairScope);
    if (!job) throw new Error('LIVE_CAST_REPAIR_JOB_MISSING');
    await write('progress.json', await edits.progress(repairScope));
    await write('steps.json', await edits.steps(repairScope));
    await write('candidate.json', candidate);
    let review: CampaignRevisionReview | null = null;
    if (candidate && job.editSpec) {
      const head = await packages.latest(scope.ownerId, scope.draftId),
        currentLocks = await controls.locks(scope);
      const currentManifest = head ? await images.manifest(scope, head.revision) : null;
      if (!head || !currentLocks || !currentManifest)
        throw new Error('LIVE_CAST_REPAIR_REVIEW_CONTEXT');
      review = await buildCampaignRevisionReview({
        kind: 'EDIT',
        sourceId: job.jobId,
        candidateDigest: candidate.contentDigest,
        head,
        after: candidate.content,
        locks: currentLocks,
        manifest: currentManifest,
        ownerId: scope.ownerId,
        editSpec: job.editSpec,
        baseline,
        retainedIdentities: await packages.identityRecords(
          scope.ownerId,
          scope.draftId,
          candidate.content,
        ),
      });
    }
    await write('review.json', review);
    await write(
      'diff.json',
      review
        ? {
            changes: review.changes,
            visualChanges: review.visualChanges,
            conflicts: review.conflicts,
            issues: review.issues,
          }
        : null,
    );
    await write('assessment.json', review?.assessment ?? null);
    result = { job: generationJobView(job), candidate, review, accountingIssues };
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    try {
      await worker?.stop();
    } catch {
      cleanupIssues.push('WORKER_STOP_FAILED');
    }
    try {
      await tasks.idle();
    } catch {
      cleanupIssues.push('ACCOUNTING_DRAIN_FAILED');
    }
    let grantDisabled = false;
    try {
      if (granted) {
        await grantPreparationApproval(pool, {
          approvalId,
          ownerId: scope.ownerId,
          enabled: false,
          authorization,
        });
        grantDisabled = true;
      }
    } catch {
      cleanupIssues.push('GRANT_DISABLE_FAILED');
    }
    try {
      await paidEvidence(input, repairJobId, accountingIssues);
    } catch {
      cleanupIssues.push('EVIDENCE_EXPORT_FAILED');
    }
    try {
      await write('cleanup.json', { grantDisabled, cleanupIssues });
    } catch {
      cleanupIssues.push('CLEANUP_EXPORT_FAILED');
    }
    try {
      await tasks.shutdown();
    } catch {
      cleanupIssues.push('ACCOUNTING_SHUTDOWN_FAILED');
    }
  }
  if (failed) throw failure;
  if (cleanupIssues.length) throw new Error(`LIVE_CAST_REPAIR_CLEANUP:${cleanupIssues.join(',')}`);
  if (!result) throw new Error('LIVE_CAST_REPAIR_RESULT_MISSING');
  return result;
}
