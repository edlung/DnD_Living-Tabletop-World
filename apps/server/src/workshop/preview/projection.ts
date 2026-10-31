import type {
  CampaignPreviewCatalog,
  CampaignPreviewEntityRef,
  CampaignPreviewEntityView,
  CampaignPreviewPerspective,
  CampaignPreviewQuery,
  CampaignPreviewScopeQuery,
  CampaignPreviewSheetView,
  CampaignPreviewView,
  CampaignRevision,
  DraftVisualManifest,
  PreparedBattlefieldLayout,
} from '@ltw/contracts';
import { encounterView } from '@ltw/combat';
import {
  characterSheetView,
  inventoryView,
  entityKnowledge,
  entityPresentationAt,
  knownEntities,
  perceivedEntityIds,
  resolvePerspective,
  scenePresentationAt,
  type CampaignSnapshot,
  type ResolvedPerspective,
} from '@ltw/domain';

import type { PreparedCampaignMaterialization } from '../packages/compiler.ts';
import { previewArt, withPreviewArt, withPreviewSceneArt, type PreviewArt } from './art.ts';

export interface PreviewContext {
  readonly revision: CampaignRevision;
  readonly materialized: PreparedCampaignMaterialization;
  readonly snapshot: CampaignSnapshot;
  readonly perspective: ResolvedPerspective;
  readonly mode: CampaignPreviewPerspective;
  readonly art: PreviewArt;
}

export function previewCatalog(revision: CampaignRevision): CampaignPreviewCatalog {
  return {
    revision: revision.revision,
    language: revision.content.world.language,
    campaignName: revision.content.world.name,
    worldName: revision.content.world.worldName,
    characters: revision.content.entities
      .filter((entity) => entity.kind === 'character')
      .map((entity) => ({
        entityId: revision.identities.entities[entity.key] ?? '',
        kind: entity.kind,
        name: entity.name,
      })),
    encounters: revision.content.encounters.map((encounter) => ({
      encounterId: revision.identities.encounters[encounter.key] ?? '',
      title: encounter.title,
      locationId: revision.identities.entities[encounter.location] ?? '',
    })),
  };
}

export function previewContext(
  revision: CampaignRevision,
  ownerId: string,
  query: CampaignPreviewScopeQuery,
  materialized: PreparedCampaignMaterialization,
  manifest: DraftVisualManifest | null,
): PreviewContext | null {
  if (
    query.revision !== revision.revision ||
    (query.perspective === 'CHARACTER' && materialized.preparedSnapshot !== null)
  )
    return null;
  const snapshot = materialized.preparedSnapshot ?? materialized.snapshot;
  if (!snapshot || materialized.assessment.readiness === 'INVALID') return null;
  const access = resolvePerspective(
    snapshot.state,
    { kind: 'user', actorId: ownerId },
    query.perspective === 'OWNER'
      ? { kind: 'DM' }
      : { kind: 'CHARACTER', characterId: query.characterId ?? '' },
    {
      memberIds: new Set(
        revision.content.party.map((key) => revision.identities.entities[key] ?? ''),
      ),
    },
  );
  if (!access.ok) return null;
  const character =
    query.perspective === 'CHARACTER'
      ? knownEntities(snapshot.state, access.perspective).find(
          (entity) => entity.entityId === query.characterId,
        )
      : null;
  if (query.perspective === 'CHARACTER' && !character) return null;
  const mode: CampaignPreviewPerspective = character
    ? { kind: 'CHARACTER', character }
    : { kind: 'OWNER' };
  return {
    revision,
    materialized,
    snapshot,
    perspective: access.perspective,
    mode,
    art: previewArt(revision, manifest, snapshot, access.perspective),
  };
}

export function previewDirectory(context: PreviewContext): CampaignPreviewEntityRef[] {
  const { snapshot, perspective } = context;
  const directory = new Map<string, CampaignPreviewEntityRef>(
    knownEntities(snapshot.state, perspective).map((entity) => [entity.entityId, entity]),
  );
  if (perspective.holderId !== null) {
    for (const id of perceivedEntityIds(snapshot.state, perspective.holderId)) {
      const entity = snapshot.state.entities.get(id);
      if (entity && !directory.has(id))
        directory.set(id, { entityId: id, kind: entity.kind, name: null });
    }
  }
  return [...directory.values()]
    .filter((entity) => entityPresentationAt(snapshot, perspective, entity.entityId, null) !== null)
    .sort(
      (a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.entityId.localeCompare(b.entityId),
    );
}

function preparedLayout(context: PreviewContext): PreparedBattlefieldLayout | null {
  const view = encounterView(context.snapshot.state, context.perspective);
  if (!view) return null;
  return {
    battlefield: view.battlefield,
    combatants: view.combatants.map((combatant) => ({
      entity: { ...combatant.entity },
      side: combatant.side,
      position: { ...combatant.position },
      state: combatant.state,
      conditions: [...combatant.conditions],
      ...(combatant.hitPoints ? { hitPoints: { ...combatant.hitPoints } } : {}),
    })),
  };
}

export function projectPreview(
  context: PreviewContext,
  query: CampaignPreviewQuery,
): CampaignPreviewView | null {
  if (
    query.perspective !== context.mode.kind ||
    (context.mode.kind === 'CHARACTER' && query.characterId !== context.mode.character.entityId)
  )
    return null;
  const { revision, snapshot, perspective } = context;
  const directory = previewDirectory(context);
  const locations = directory.filter((entity) => entity.kind === 'location');
  const encounter =
    query.encounterId === undefined
      ? null
      : revision.content.encounters.find(
          (item) => revision.identities.encounters[item.key] === query.encounterId,
        );
  if (query.encounterId !== undefined && (!encounter || !context.materialized.preparedSnapshot))
    return null;
  const initial =
    context.mode.kind === 'CHARACTER'
      ? snapshot.state.entities.get(context.mode.character.entityId)?.placement?.locationId
      : revision.content.world.startLocation === null
        ? null
        : revision.identities.entities[revision.content.world.startLocation];
  const camera =
    query.locationId ??
    (encounter ? revision.identities.entities[encounter.location] : initial) ??
    locations[0]?.entityId ??
    null;
  if (camera !== null && !locations.some((location) => location.entityId === camera)) return null;
  const scene = camera === null ? null : scenePresentationAt(snapshot, perspective, camera, null);
  if (camera !== null && scene === null) return null;
  const base = {
    revision: revision.revision,
    language: revision.content.world.language,
    campaignName: snapshot.state.campaign?.name ?? '',
    worldName: snapshot.state.campaign?.worldName ?? '',
    manifestDigest: context.art.digest,
    directory,
    locations,
    scene: withPreviewSceneArt(scene, context.art),
  };
  if (context.mode.kind === 'CHARACTER') return { ...base, perspective: context.mode };
  const layout = encounter ? preparedLayout(context) : null;
  return {
    ...base,
    perspective: context.mode,
    assessment: context.materialized.assessment,
    prepared:
      encounter && layout
        ? { encounterId: query.encounterId ?? '', title: encounter.title, layout }
        : null,
  };
}

export function projectPreviewEntity(
  context: PreviewContext,
  entityId: string,
): CampaignPreviewEntityView | null {
  const entity = previewDirectory(context).find((item) => item.entityId === entityId);
  const presentation = entityPresentationAt(context.snapshot, context.perspective, entityId, null);
  if (!entity || !presentation) return null;
  const knowledge =
    entityKnowledge(context.snapshot.state, context.perspective, entityId)?.knowledge ?? [];
  return {
    revision: context.revision.revision,
    perspective: context.mode,
    entity,
    knowledge,
    presentation: {
      ...presentation,
      presentation: withPreviewArt(presentation.presentation, context.art),
    },
    ...(context.mode.kind === 'OWNER'
      ? { ownerDescription: context.snapshot.state.entities.get(entityId)?.description ?? '' }
      : {}),
  };
}

export function projectPreviewSheet(
  context: PreviewContext,
  entityId: string,
): CampaignPreviewSheetView | null {
  const view = characterSheetView(context.snapshot.state, context.perspective, entityId);
  return view === null ? null : { ...view, revision: context.revision.revision };
}

export function projectPreviewInventory(context: PreviewContext, entityId: string) {
  const view = inventoryView(context.snapshot.state, context.perspective, entityId);
  return view === null ? null : { ...view, revision: context.revision.revision };
}
