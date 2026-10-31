/** Absence means a legacy campaign; never cache it as permanent publication permission. */
export type CampaignPublicationState = 'UNTRACKED' | 'UNPUBLISHED' | 'PUBLISHED';
export interface CampaignPublication {
  state(campaignId: string): Promise<CampaignPublicationState>;
}
