import {
  campaignGenerationOutputSchemas,
  campaignGenerationStageSchema,
  campaignPackageSchema,
  type CampaignFinding,
  type CampaignGenerationStage,
  type CampaignPackage,
} from '@ltw/contracts';

import { mergeCampaignGenerationStep } from './generation.ts';
import { clueTargetSupportsMethod } from '../investigation/authoring.ts';
import { PLACEABLE_KINDS } from '../kernel/state.ts';
import { compareKey, topological, uniqueKeys, type PlanContext } from './context.ts';
import { validateEntities, validateKnowledge } from './references.ts';
import { rewriteQuests, validateStory } from './story.ts';

export type CampaignGenerationStepValidation =
  | { readonly ok: true; readonly value: CampaignPackage }
  | { readonly ok: false; readonly issues: readonly string[] };

const LIMIT = 32;
const clip = (value: string, length: number) => value.replace(/\p{Cc}/gu, ' ').slice(0, length);
function failures(findings: readonly CampaignFinding[]): CampaignGenerationStepValidation {
  const distinct = [
    ...new Map(
      findings.map((entry) => [`${entry.code}/${entry.path}/${entry.message}`, entry]),
    ).values(),
  ].sort(
    (a, b) =>
      compareKey(a.path, b.path) || compareKey(a.code, b.code) || compareKey(a.message, b.message),
  );
  const issues = distinct
    .slice(0, distinct.length > LIMIT ? LIMIT - 1 : LIMIT)
    .map(
      (entry) => `${clip(entry.code, 64)} at ${clip(entry.path, 160)}: ${clip(entry.message, 240)}`,
    );
  if (distinct.length > LIMIT)
    issues.push(
      'CAMPAIGN_STAGE_ISSUE_LIMIT at output: Additional issues omitted; repair the reported fields first.',
    );
  return { ok: false, issues };
}
const fault = (code: string, path: string, message: string): CampaignFinding => ({
  severity: 'error',
  code,
  path,
  message,
});
const schemaMessages: Readonly<Record<string, string>> = {
  invalid_type: 'Use the declared field type.',
  invalid_value: 'Use an allowed literal or enum value.',
  too_small: 'A required field or collection is empty or too small.',
  too_big: 'The field or collection exceeds its technical limit.',
  invalid_format: 'Use the declared key or identifier format.',
  unrecognized_keys: 'Return only fields owned by this stage.',
};

/** Only resolved dependencies and sections owned by this step are inspected. No IDs are allocated. */
function contextFor(value: CampaignPackage, stage: CampaignGenerationStage): PlanContext {
  const content: CampaignPackage = {
    ...value,
    knowledge: [],
    clues: [],
    conflicts: [],
    relationships: [],
    visuals: [],
    situations: [],
    encounters: [],
    quests: [],
    firstSession: [],
    laterOutline: [],
  };
  if (stage === 'topology') {
    content.entities = value.entities.filter((entity) => entity.kind === 'location');
    content.party = [];
  }
  if (stage === 'cast') {
    content.conflicts = value.conflicts;
    content.relationships = value.relationships;
    content.visuals = value.visuals;
  }
  if (stage === 'knowledge') {
    content.knowledge = value.knowledge;
    content.clues = value.clues;
  }
  if (stage === 'encounters') content.encounters = value.encounters;
  if (stage === 'first-session') {
    content.clues = value.clues;
    content.situations = value.situations;
    content.quests = value.quests;
    content.firstSession = value.firstSession;
  }
  return {
    content,
    entities: new Map(content.entities.map((entity) => [entity.key, entity])),
    knowledge: new Map(content.knowledge.map((record) => [record.key, record])),
    // Reference validators use local keys. Quest rewriting is discarded; canonical IDs belong to storage.
    ids: { entities: {}, knowledge: {}, clues: {}, encounters: {}, scene: '' },
    findings: [],
    incomplete: false,
  };
}

/** Shape plus repairable, stage-owned semantic checks; the final compiler still decides readiness. */
export function validateCampaignGenerationStep(
  content: CampaignPackage,
  stage: CampaignGenerationStage,
  output: unknown,
): CampaignGenerationStepValidation {
  const current = campaignPackageSchema.safeParse(content);
  if (!current.success)
    return failures([
      fault(
        'CAMPAIGN_GENERATION_INPUT_INVALID',
        'content',
        'The existing campaign content has an unsupported shape.',
      ),
    ]);
  if (!campaignGenerationStageSchema.safeParse(stage).success)
    return failures([
      fault('CAMPAIGN_GENERATION_STAGE_INVALID', 'stage', 'Use a declared generation stage.'),
    ]);
  const parsed = campaignGenerationOutputSchemas[stage].safeParse(output);
  if (!parsed.success)
    return failures(
      parsed.error.issues.map((issue) =>
        fault(
          `CAMPAIGN_STAGE_SCHEMA_${issue.code.toUpperCase()}`,
          `${stage}${issue.path.length ? `.${issue.path.map(String).join('.')}` : ''}`,
          schemaMessages[issue.code] ?? 'The declared stage constraints were not satisfied.',
        ),
      ),
    );
  let value: CampaignPackage;
  try {
    value = mergeCampaignGenerationStep(current.data, stage, parsed.data);
  } catch {
    return failures([
      fault(
        'CAMPAIGN_STAGE_AGGREGATE_INVALID',
        stage,
        'The merged package exceeds its shape or collection limits.',
      ),
    ]);
  }
  const context = contextFor(value, stage);
  const add = (code: string, path: string, message: string) =>
    context.findings.push(fault(code, path, message));
  switch (stage) {
    case 'concept':
      if (!value.world.opening.trim())
        add(
          'OPENING_INCOMPLETE',
          'world.opening',
          'Provide the initial opening before continuing.',
        );
      break;
    case 'topology':
      validateEntities(context);
      topological(
        context,
        context.content.entities,
        (entity) => (entity.location?.parent ? [entity.location.parent] : []),
        'entities',
      );
      uniqueKeys(context, value.conflicts, 'conflicts');
      break;
    case 'cast':
      validateEntities(context);
      validateStory(context);
      for (const entity of value.entities) {
        if (entity.status === 'active' && PLACEABLE_KINDS.has(entity.kind) && !entity.placement)
          add(
            'CAST_PLACEMENT_INCOMPLETE',
            `entities.${entity.key}.placement`,
            'Give this active physical entity a placement in a declared location before accepting cast.',
          );
      }
      if (value.party.length !== value.brief.partySize)
        add(
          'PARTY_SIZE_MISMATCH',
          'party',
          `Declare exactly ${value.brief.partySize} prepared character seats from the brief.`,
        );
      for (const key of value.party) {
        const entity = context.entities.get(key);
        if (
          entity?.kind === 'character' &&
          entity.placement &&
          entity.placement.location !== value.world.startLocation
        )
          add(
            'PARTY_START_LOCATION',
            `party.${key}.placement`,
            'Place the prepared character at world.startLocation.',
          );
      }
      break;
    case 'knowledge':
      validateKnowledge(context);
      topological(
        context,
        value.knowledge,
        (record) => record.relations.map((relation) => relation.knowledge),
        'knowledge',
      );
      validateStory(context);
      for (const clue of value.clues) {
        const entity = context.entities.get(clue.entity);
        if (entity && !clueTargetSupportsMethod(entity.kind, clue.method))
          add(
            'INVALID_CLUE',
            `clues.${clue.key}.entity`,
            `A ${clue.method} clue cannot be placed on a ${entity.kind}.`,
          );
      }
      break;
    case 'encounters':
      validateStory(context);
      break;
    case 'first-session':
      validateStory(context);
      rewriteQuests(context);
      if (!value.firstSession.some((step) => step.trim()))
        add(
          'SESSION_PLAN_INCOMPLETE',
          'firstSession',
          'Provide the first-session preparation notes.',
        );
      break;
    case 'outline':
      break;
  }
  const required =
    stage === 'topology'
      ? new Set(['START_LOCATION_INCOMPLETE'])
      : stage === 'cast'
        ? new Set([
            'SHEET_INCOMPLETE',
            'PARTY_INCOMPLETE',
            'PARTY_PLACEMENT_INCOMPLETE',
            'START_LOCATION_INCOMPLETE',
          ])
        : new Set<string>();
  const blocking = context.findings.filter(
    (entry) => entry.severity === 'error' || required.has(entry.code),
  );
  return blocking.length ? failures(blocking) : { ok: true, value };
}
