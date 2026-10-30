import type {
  CampaignEditPlanView,
  CampaignEditPlanConflict,
  CampaignRevision,
  DraftLockSnapshot,
  DraftVisualManifest,
} from '@ltw/contracts';

import { campaignEditDependencies } from './dependencies.ts';
import { campaignEditTargets } from './targets.ts';

export function buildCampaignEditPlan(
  revision: CampaignRevision,
  locks: DraftLockSnapshot,
  manifest: Pick<DraftVisualManifest, 'version' | 'digest'>,
  instruction: string,
  requestedTargets: readonly string[],
): CampaignEditPlanView {
  const locked = new Set(
    locks.entries.flatMap((entry) =>
      entry.target.kind === 'content' ? [entry.target.targetId] : [],
    ),
  );
  const targets = campaignEditTargets(revision, locked);
  const byId = new Map(targets.map((target) => [target.targetId, target]));
  const requested = [...new Set(requestedTargets)].sort();
  const conflicts = requested.flatMap<CampaignEditPlanConflict>((id) => {
    const target = byId.get(id);
    return !target
      ? [{ targetId: id, label: 'Missing target', reason: 'MISSING' as const }]
      : target.ambiguous
        ? [{ targetId: id, label: target.label, reason: 'AMBIGUOUS' as const }]
        : target.locked
          ? [{ targetId: id, label: target.label, reason: 'LOCKED' as const }]
          : [];
  });
  if (!requested.length || conflicts.length) return { targets, spec: null, conflicts };
  const edges = campaignEditDependencies(revision);
  const reached = new Map(requested.map((id) => [id, new Set(['Selected by owner'])]));
  const queue = [...requested];
  while (queue.length) {
    const id = queue.shift();
    if (id === undefined) break;
    const target = byId.get(id);
    if (target?.locked || target?.ambiguous) continue;
    for (const edge of edges) {
      if (edge.source !== id || !byId.has(edge.dependent)) continue;
      const existing = reached.get(edge.dependent);
      const reasons = existing ?? new Set<string>();
      reasons.add(edge.reason);
      reached.set(edge.dependent, reasons);
      if (!existing) queue.push(edge.dependent);
    }
  }
  return {
    targets,
    conflicts: [],
    spec: {
      version: 1,
      baselineDigest: revision.digest,
      instruction: instruction.trim(),
      requestedTargets: requested,
      closure: [...reached.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([targetId, reasons]) => ({
          targetId,
          reasons: [...reasons].sort(),
          readOnly: byId.get(targetId)?.locked === true || byId.get(targetId)?.ambiguous === true,
        })),
      lockSnapshot: structuredClone(locks),
      manifestVersion: manifest.version,
      manifestDigest: manifest.digest,
    },
  };
}
