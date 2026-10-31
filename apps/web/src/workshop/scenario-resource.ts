import type { CampaignAssessment, CampaignPackage } from '@ltw/contracts';
import { useCallback } from 'react';

import { useResource } from '../api/resource.ts';
import type { WorkshopClient } from './client.ts';
import { editingContextSchema, type EditingContext } from './editing/schemas.ts';
import { generationViewSchema } from './response-schemas.ts';

export type ReadScenarioSource =
  | { readonly kind: 'revision'; readonly revision: number | null }
  | { readonly kind: 'candidate'; readonly jobId: string }
  | { readonly kind: 'step'; readonly jobId: string; readonly ordinal: number };
export interface ScenarioData {
  readonly content: CampaignPackage | null;
  readonly assessment: CampaignAssessment | null;
  readonly revision: number | null;
  readonly entities: Readonly<Record<string, string>> | null;
  readonly context: EditingContext | null;
}
export const readScenarioKey = (source: ReadScenarioSource) =>
  source.kind === 'revision'
    ? `revision:${String(source.revision)}`
    : source.kind === 'candidate'
      ? `candidate:${source.jobId}`
      : `step:${source.jobId}:${source.ordinal}`;
export function useScenarioResource(
  client: WorkshopClient,
  draftId: string,
  source: ReadScenarioSource,
) {
  const key = readScenarioKey(source);
  const load = useCallback(
    async (signal: AbortSignal): Promise<ScenarioData> => {
      if (source.kind !== 'revision') {
        const result = await client.request(
          `/drafts/${draftId}/generation/${source.jobId}`,
          generationViewSchema,
          { signal },
        );
        if (result.kind !== 'ready') throw new Error('WORKSHOP_READ_FAILED');
        const content =
          source.kind === 'candidate'
            ? result.value.candidate?.content
            : result.value.steps.find(
                (step) => step.ordinal === source.ordinal && step.status === 'SUCCEEDED',
              )?.content;
        if (!content) throw new Error('WORKSHOP_READ_FAILED');
        return { content, assessment: null, revision: null, entities: null, context: null };
      }
      const query = source.revision === null ? '' : `?revision=${String(source.revision)}`;
      const result = await client.request(
        `/drafts/${draftId}/editing${query}`,
        editingContextSchema,
        { signal },
      );
      if (result.kind === 'missing' && source.revision === null)
        return { content: null, assessment: null, revision: null, entities: null, context: null };
      if (result.kind !== 'ready') throw new Error('WORKSHOP_READ_FAILED');
      if (source.revision !== null && result.value.revision.revision !== source.revision)
        throw new Error('WORKSHOP_READ_FAILED');
      return {
        content: result.value.revision.content,
        assessment: result.value.assessment,
        revision: result.value.revision.revision,
        entities: result.value.revision.identities.entities,
        context: result.value,
      };
    },
    [client, draftId, key],
  );
  return useResource(`scenario:${draftId}:${key}`, load);
}
