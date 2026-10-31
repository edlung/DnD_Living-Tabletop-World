import { z } from 'zod';

import type { EncounterCombatantView, EncounterView } from '../combat/views.ts';
import type { Language } from '../language/language.ts';
import type { EntityRef, KnowledgeView } from '../knowledge/views.ts';
import type { EntityKind } from '../kernel/world-commands.ts';
import type { CharacterSheetResponse } from '../rules/character-view.ts';
import type { EntityPresentationResponse, ScenePresentationResponse } from '../visual/views.ts';
import { workshopIdSchema } from '../workshop/access.ts';
import type { CampaignAssessment } from './package.ts';

const revision = z.coerce.number().int().min(1).max(1_000_000);
export const campaignPreviewRevisionQuerySchema = z.object({ revision }).strict();
const scope = z.object({
  revision,
  perspective: z.enum(['OWNER', 'CHARACTER']),
  characterId: workshopIdSchema.optional(),
});
const validScope = (value: z.infer<typeof scope>) =>
  value.perspective === 'CHARACTER'
    ? value.characterId !== undefined
    : value.characterId === undefined;

export const campaignPreviewScopeQuerySchema = scope.strict().refine(validScope);
export const campaignPreviewQuerySchema = scope
  .extend({ locationId: workshopIdSchema.optional(), encounterId: workshopIdSchema.optional() })
  .strict()
  .refine(validScope)
  .refine((value) => value.locationId === undefined || value.encounterId === undefined)
  .refine((value) => value.perspective === 'OWNER' || value.encounterId === undefined);
export type CampaignPreviewScopeQuery = z.infer<typeof campaignPreviewScopeQuerySchema>;
export type CampaignPreviewQuery = z.infer<typeof campaignPreviewQuerySchema>;

/** An observed unidentified object has an opaque ID but never a canonical name. */
export interface CampaignPreviewEntityRef {
  readonly entityId: string;
  readonly kind: EntityKind;
  readonly name: string | null;
}
export interface PreparedBattlefieldLayout {
  readonly battlefield: EncounterView['battlefield'];
  readonly combatants: readonly Omit<EncounterCombatantView, 'initiative'>[];
}
export interface CampaignPreviewCatalog {
  readonly revision: number;
  readonly language: Language;
  readonly campaignName: string;
  readonly worldName: string;
  readonly characters: readonly EntityRef[];
  readonly encounters: readonly {
    readonly encounterId: string;
    readonly title: string;
    readonly locationId: string;
  }[];
}
export type CampaignPreviewPerspective =
  { readonly kind: 'OWNER' } | { readonly kind: 'CHARACTER'; readonly character: EntityRef };

interface PreviewBase {
  readonly revision: number;
  readonly language: Language;
  readonly campaignName: string;
  readonly worldName: string;
  /** Digest of permitted selected art only; restricted views never receive the owner manifest. */
  readonly manifestDigest: string;
  readonly directory: readonly CampaignPreviewEntityRef[];
  readonly locations: readonly CampaignPreviewEntityRef[];
  readonly scene: ScenePresentationResponse | null;
}
export type CampaignPreviewView =
  | (PreviewBase & {
      readonly perspective: { readonly kind: 'OWNER' };
      readonly assessment: CampaignAssessment;
      readonly prepared: {
        readonly encounterId: string;
        readonly title: string;
        readonly layout: PreparedBattlefieldLayout;
      } | null;
    })
  | (PreviewBase & {
      readonly perspective: { readonly kind: 'CHARACTER'; readonly character: EntityRef };
    });

/** No canonical description or owner provenance is added to a character's knowledge. */
export interface CampaignPreviewEntityView {
  readonly revision: number;
  readonly perspective: CampaignPreviewPerspective;
  readonly entity: CampaignPreviewEntityRef;
  readonly knowledge: readonly KnowledgeView[];
  readonly presentation: EntityPresentationResponse;
  readonly ownerDescription?: string;
}
export interface CampaignPreviewSheetView extends CharacterSheetResponse {
  readonly revision: number;
}
