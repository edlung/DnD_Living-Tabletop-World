import type { CampaignPreviewView } from '@ltw/contracts';

export type PreviewScope =
  | { readonly revision: number; readonly perspective: 'OWNER' }
  | { readonly revision: number; readonly perspective: 'CHARACTER'; readonly characterId: string };
export interface PreviewCamera {
  readonly locationId?: string;
  readonly encounterId?: string;
}

export function previewQuery(scope: PreviewScope, camera: PreviewCamera = {}): string {
  const query = new URLSearchParams({
    revision: String(scope.revision),
    perspective: scope.perspective,
  });
  if (scope.perspective === 'CHARACTER') query.set('characterId', scope.characterId);
  if (camera.locationId) query.set('locationId', camera.locationId);
  if (camera.encounterId && scope.perspective === 'OWNER')
    query.set('encounterId', camera.encounterId);
  return query.toString();
}
export const previewScopeKey = (scope: PreviewScope): string =>
  `${scope.revision}:${scope.perspective}:${scope.perspective === 'CHARACTER' ? scope.characterId : ''}`;

/** The response must resolve the exact requested character, never a broader perspective. */
export function previewMatches(
  scope: PreviewScope,
  view: Pick<CampaignPreviewView, 'revision' | 'perspective'>,
): boolean {
  return (
    view.revision === scope.revision &&
    view.perspective.kind === scope.perspective &&
    (scope.perspective === 'OWNER' ||
      (view.perspective.kind === 'CHARACTER' &&
        view.perspective.character.entityId === scope.characterId))
  );
}
