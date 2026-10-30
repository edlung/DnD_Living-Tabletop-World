import type {
  AssetPurpose,
  CampaignPackage,
  CampaignRevision,
  DraftImageSlot,
} from '@ltw/contracts';

export const CAMPAIGN_IMAGE_TEMPLATE_VERSION = 1;

/** Exact-purpose appearance, with the original portrait/location brief as a derived fallback. */
export function resolveCampaignVisualBrief(
  content: CampaignPackage,
  key: string,
  purpose: AssetPurpose,
) {
  const exact = content.visuals.filter((item) => item.entity === key && item.purpose === purpose);
  if (exact.length > 1) return null;
  if (exact[0]) return exact[0];
  if (purpose === 'image') return null;
  const fallback = content.visuals.filter(
    (item) => item.entity === key && item.purpose === 'image',
  );
  return fallback.length === 1 ? (fallback[0] ?? null) : null;
}

/** Shared deterministic staleness input. Narrative fields stay here, never in the image prompt. */
export function campaignImageSourceProjection(
  revision: CampaignRevision,
  slot: DraftImageSlot,
  referenceHash: string | null,
) {
  const entity = revision.content.entities.find(
    (item) => revision.identities.entities[item.key] === slot.entityId,
  );
  if (!entity) return null;
  if (slot.purpose === 'figure' && !['character', 'npc', 'creature'].includes(entity.kind))
    return null;
  if (slot.purpose === 'battle-map' && entity.kind !== 'location') return null;
  if (
    (slot.purpose === 'image' &&
      (slot.variant !== 'reference' || slot.label !== null || referenceHash !== null)) ||
    (slot.purpose !== 'image' &&
      (slot.variant !== 'derived' || slot.label !== slot.purpose || referenceHash === null))
  )
    return null;
  const visual = resolveCampaignVisualBrief(revision.content, entity.key, slot.purpose);
  if (!visual || visual.description.trim() === '') return null;
  const geometry =
    slot.purpose === 'battle-map'
      ? revision.content.encounters
          .filter((encounter) => encounter.location === entity.key)
          .map((encounter) => ({
            id: revision.identities.encounters[encounter.key],
            battlefield: encounter.battlefield,
          }))
          .sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))
      : [];
  return {
    templateVersion: CAMPAIGN_IMAGE_TEMPLATE_VERSION,
    entityId: slot.entityId,
    kind: entity.kind,
    name: entity.name,
    description: entity.description,
    appearance: visual.description,
    style: visual.style,
    purpose: slot.purpose,
    variant: slot.variant,
    label: slot.label,
    geometry,
    referenceHash,
  };
}
