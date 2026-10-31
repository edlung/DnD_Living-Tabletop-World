import {
  CAMPAIGN_EDIT_SECTIONS,
  campaignPackageSchema,
  type CampaignEditSection,
  type CampaignEditSpec,
  type CampaignPackage,
  type CampaignRevision,
} from '@ltw/contracts';

import { campaignImageSourceProjection } from '../visual-source.ts';
import { campaignEditValueEqual as equal } from './equal.ts';
import { buildCampaignEditPlan } from './plan.ts';
import { campaignEditTargetRecords, resolveCampaignEditTarget } from './targets.ts';

import { KEYED_CAMPAIGN_EDIT_SECTIONS as KEYED, campaignEditRowKey as rowKey } from './keys.ts';

function groups(section: CampaignEditSection, rows: readonly unknown[]) {
  const result = new Map<string, unknown[]>();
  for (const row of rows) {
    const key = rowKey(section, row);
    if (key !== null) result.set(key, [...(result.get(key) ?? []), row]);
  }
  return result;
}

function outsideScope(
  base: CampaignRevision,
  candidate: CampaignPackage,
  allowed: ReadonlySet<string>,
): string[] {
  const issues: string[] = [];
  const targets = campaignEditTargetRecords(base);
  for (const section of CAMPAIGN_EDIT_SECTIONS) {
    if (allowed.has(`section:${section}`) || equal(base.content[section], candidate[section]))
      continue;
    const before = base.content[section],
      after = candidate[section];
    if (!KEYED.has(section) || !Array.isArray(before) || !Array.isArray(after)) {
      issues.push(`EDIT_OUTSIDE_SCOPE:${section}`);
      continue;
    }
    const oldGroups = groups(section, before),
      newGroups = groups(section, after);
    for (const [key, values] of oldGroups) {
      const rows = targets.filter((target) => target.section === section && target.key === key);
      const target = rows.length === 1 ? (rows[0] ?? null) : null;
      const permitted = target !== null && allowed.has(target.targetId);
      const changed = newGroups.get(key) ?? [];
      if ((!permitted && !equal(values, changed)) || (permitted && changed.length > 1))
        issues.push(`EDIT_OUTSIDE_SCOPE:${section}`);
    }
    for (const key of newGroups.keys())
      if (!oldGroups.has(key)) issues.push(`EDIT_OUTSIDE_SCOPE:${section}`);
    // Reordering a collection requires the collection target, not permission over one row.
    const expectedOrder = before
      .map((row) => rowKey(section, row))
      .filter((key) => key !== null && newGroups.has(key));
    if (
      !equal(
        expectedOrder,
        after.map((row) => rowKey(section, row)),
      )
    )
      issues.push(`EDIT_OUTSIDE_ORDER:${section}`);
  }
  return issues;
}

/** Stored server scope only; untrusted output cannot widen its target set or release a lock. */
export function validateCampaignEditOutput(
  base: CampaignRevision,
  output: unknown,
  spec: CampaignEditSpec,
):
  | { readonly ok: true; readonly value: CampaignPackage }
  | { readonly ok: false; readonly issues: readonly string[] } {
  const parsed = campaignPackageSchema.safeParse(output);
  if (!parsed.success) return { ok: false, issues: ['CAMPAIGN_EDIT_SCHEMA'] };
  if (base.digest !== spec.baselineDigest) return { ok: false, issues: ['CAMPAIGN_EDIT_BASELINE'] };
  const resolved = buildCampaignEditPlan(
    base,
    spec.lockSnapshot,
    { version: spec.manifestVersion, digest: spec.manifestDigest },
    spec.instruction,
    spec.requestedTargets,
  );
  if (!resolved.spec || !equal(resolved.spec.closure, spec.closure))
    return { ok: false, issues: ['CAMPAIGN_EDIT_SCOPE'] };
  const candidate = parsed.data;
  const allowed = new Set(
    spec.closure.filter((item) => !item.readOnly).map((item) => item.targetId),
  );
  const issues = outsideScope(base, candidate, allowed);
  if (candidate.world.language !== base.content.world.language)
    issues.push('CAMPAIGN_EDIT_LANGUAGE');
  for (const entity of base.content.entities) {
    const changed = candidate.entities.find((item) => item.key === entity.key);
    if (changed && changed.kind !== entity.kind) issues.push('CAMPAIGN_EDIT_IDENTITY_KIND');
  }
  const proposed = { ...base, content: candidate };
  for (const lock of spec.lockSnapshot.entries) {
    if (lock.target.kind === 'content') {
      const prior = resolveCampaignEditTarget(base, lock.target.targetId);
      const next = resolveCampaignEditTarget(proposed, lock.target.targetId);
      if (
        !prior ||
        !next ||
        !equal(prior.projection, lock.projection) ||
        !equal(next.projection, lock.projection)
      )
        issues.push(`CAMPAIGN_EDIT_LOCKED:${lock.target.targetId}`);
    } else {
      const projection = lock.projection;
      const referenceHash =
        typeof projection === 'object' &&
        projection !== null &&
        'referenceHash' in projection &&
        (projection.referenceHash === null || typeof projection.referenceHash === 'string')
          ? projection.referenceHash
          : undefined;
      if (
        referenceHash === undefined ||
        !equal(
          campaignImageSourceProjection(base, lock.target, referenceHash),
          campaignImageSourceProjection(proposed, lock.target, referenceHash),
        )
      )
        issues.push('CAMPAIGN_EDIT_LOCKED_IMAGE');
    }
  }
  return issues.length
    ? { ok: false, issues: [...new Set(issues)] }
    : { ok: true, value: candidate };
}
