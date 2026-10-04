import type { ChronicleSourceView } from '../chronicle/views.ts';

/**
 * The party's quest log (docs/adr/0025-ravenford-integration.md §2). Each
 * transition is a projection of the party's own history: `QuestActivated`
 * once, then `QuestUpdated` per milestone reached, in world-time order, each
 * with the events it rests on. Players see event IDs; the DM also sequences.
 */
export interface QuestTransitionView {
  readonly type: 'QuestActivated' | 'QuestUpdated';
  /** `activated`, or the milestone's stage. */
  readonly stage: string;
  readonly worldTime: number;
  readonly summary: string;
  readonly sources: readonly ChronicleSourceView[];
}

export interface QuestView {
  readonly questId: string;
  readonly title: string;
  readonly transitions: readonly QuestTransitionView[];
}

/** `GET /campaigns/:campaignId/quests?perspective=…`: active quests only. */
export interface QuestListResponse {
  readonly perspective: string;
  readonly quests: readonly QuestView[];
}
