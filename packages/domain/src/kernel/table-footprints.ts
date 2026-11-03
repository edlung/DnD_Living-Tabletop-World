import type { KernelEventOf } from './events.ts';
import { entityChecked, facts, type FactKey } from './fact-keys.ts';
import type { Footprint } from './facts.ts';

/**
 * Footprints of the world facts the DM and the table set beside the story (docs/adr/0007-world-
 * kernel-model-and-event-store.md, "Undo footprint"): a location's weather (ADR 0023 §1), an NPC's
 * attitude (ADR 0019 §3), the campaign's options and a player's wish for a portrait
 * (docs/adr/0056-characters-from-the-srd.md §3, §5).
 */
export function tableFootprint(
  event: KernelEventOf<
    'PortraitAsked' | 'CampaignOptionsSet' | 'WeatherSet' | 'RelationshipChanged' | 'MerchantSet'
  >,
  clock: FactKey,
): Footprint {
  switch (event.type) {
    case 'PortraitAsked':
      return {
        reads: [...entityChecked(event.payload.characterId)],
        writes: [facts.portraitWish(event.payload.characterId)],
      };
    case 'CampaignOptionsSet':
      return { reads: [facts.campaign()], writes: [facts.campaignOptions()] };
    // An NPC's shop (docs/adr/0057-encounters-maps-loot.md §8).
    case 'MerchantSet':
      return {
        reads: [...entityChecked(event.payload.npcId)],
        writes: [facts.merchant(event.payload.npcId)],
      };
    case 'WeatherSet':
      return {
        reads: [clock, ...entityChecked(event.payload.locationId)],
        writes: [facts.weather(event.payload.locationId)],
      };
    case 'RelationshipChanged':
      return {
        reads: [clock, ...entityChecked(event.payload.npcId)],
        writes: [facts.relationship(event.payload.npcId)],
      };
  }
}
