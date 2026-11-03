import { z } from 'zod';

import { MAX_CRAFT_HELPERS } from '../items/crafting.ts';

/**
 * The campaign's options (docs/FULL_GAME_PLAN.md decision 16; docs/adr/0056-characters-from-the-
 * srd.md §3): a new level's hit points — the player's choice, always the fixed value, or always
 * rolled by the World Engine; levels by experience or by milestone; carrying weight shown, or
 * enforced as the SRD's Carrying Capacity says; the level a new character starts at, so one
 * who joins later joins at the party's; and how many may help on a crafting project — one, as the
 * SRD has it, unless the DM allows more (docs/adr/0057-encounters-maps-loot.md §9). The DM sets them.
 */
export const HIT_POINTS_AT_LEVEL = ['choice', 'fixed', 'rolled'] as const;
export const LEVELS_BY = ['experience', 'milestone'] as const;
export const CARRYING = ['shown', 'enforced'] as const;

export const campaignOptionsSchema = z
  .object({
    hitPointsAtLevel: z.enum(HIT_POINTS_AT_LEVEL),
    levelsBy: z.enum(LEVELS_BY),
    carrying: z.enum(CARRYING),
    startingLevel: z.number().int().min(1).max(20),
    /** Absent in options set before Stage 670f: one. */
    craftingHelpers: z.number().int().min(1).max(MAX_CRAFT_HELPERS).optional(),
  })
  .strict();
export type CampaignOptions = z.infer<typeof campaignOptionsSchema>;
export type HitPointsAtLevel = CampaignOptions['hitPointsAtLevel'];
export type LevelsBy = CampaignOptions['levelsBy'];

export const DEFAULT_CAMPAIGN_OPTIONS: CampaignOptions = {
  hitPointsAtLevel: 'choice',
  levelsBy: 'experience',
  carrying: 'shown',
  startingLevel: 1,
  craftingHelpers: 1,
};

export const setCampaignOptionsCommandSchema = z
  .object({ type: z.literal('SetCampaignOptions'), options: campaignOptionsSchema })
  .strict();
