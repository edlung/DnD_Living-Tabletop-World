import { useEffect, type Dispatch, type SetStateAction } from 'react';

import type { ActionNotice } from '../exploration/use-action.ts';

export interface Conversation {
  readonly npcId: string;
  /** The line just spoken, shown with the conversation; null before any. */
  readonly line: string | null;
}

/**
 * A spoken line belongs to the conversation with whoever spoke it; an NPC who would not talk
 * now leaves no conversation open (no "Keep talking" after a refusal).
 */
export function useConversationNotice(
  notice: ActionNotice | null,
  setConversation: Dispatch<SetStateAction<Conversation | null>>,
): void {
  useEffect(() => {
    const refused = notice?.talkRefusedBy;
    if (refused) setConversation((current) => (current?.npcId === refused ? null : current));
    const speech = notice?.speech;
    const speaker = notice?.speakerId;
    if (!speech || !speaker) return;
    setConversation((current) =>
      current?.npcId === speaker ? { npcId: speaker, line: speech } : current,
    );
  }, [notice]);
}
