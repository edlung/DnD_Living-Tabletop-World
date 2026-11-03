import {
  DEFAULT_CAMPAIGN_OPTIONS,
  campaignOptionsSchema,
  type CampaignOptions,
} from '@ltw/contracts';
import { z } from 'zod';

import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { RecordedEvent, Restore } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';

/**
 * The campaign's options (docs/adr/0056-characters-from-the-srd.md §3): a world fact the DM sets,
 * read by advancement, by carrying and by a new character's level. A history that never set them
 * has the defaults. Undo restores the options before; a later change blocks it, as any writer.
 */
export const campaignOptionsSetPayloadSchema = z
  .object({ from: campaignOptionsSchema, to: campaignOptionsSchema })
  .strict();

export const campaignOptionsRestoreSchemas = [
  z.object({ fact: z.literal('campaignOptions'), value: campaignOptionsSchema }).strict(),
] as const;

/** The campaign's options now; the defaults before any were set. */
export const campaignOptions = (state: WorldState): CampaignOptions =>
  state.campaign?.options ?? DEFAULT_CAMPAIGN_OPTIONS;

const KEYS = Object.keys(DEFAULT_CAMPAIGN_OPTIONS) as (keyof CampaignOptions)[];
const same = (a: CampaignOptions, b: CampaignOptions) => KEYS.every((key) => a[key] === b[key]);

export function decideSetCampaignOptions(
  state: WorldState,
  command: ResolvedCommandOf<'SetCampaignOptions'>,
): Decision {
  if (state.campaign === null) return reject('CAMPAIGN_NOT_FOUND', 'No campaign');
  const from = campaignOptions(state);
  if (same(from, command.options)) {
    return reject('NO_EFFECT', 'The campaign already has these options');
  }
  return accept({ type: 'CampaignOptionsSet', payload: { from, to: command.options } });
}

export function applyCampaignOptionsSet(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'CampaignOptionsSet' }>,
): WorldState {
  if (state.campaign === null) throw new CorruptHistoryError('options of no campaign');
  if (!same(campaignOptions(state), event.payload.from)) {
    throw new CorruptHistoryError('the campaign options were not the ones changed');
  }
  return { ...state, campaign: { ...state.campaign, options: event.payload.to } };
}

export function applyCampaignOptionsRestore(
  state: WorldState,
  restore: Extract<Restore, { fact: 'campaignOptions' }>,
): WorldState {
  if (state.campaign === null) throw new CorruptHistoryError('options of no campaign');
  return { ...state, campaign: { ...state.campaign, options: restore.value } };
}
