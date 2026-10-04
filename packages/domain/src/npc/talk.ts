import type { RejectionCode } from '@ltw/contracts';

import { acting, isIncapacitated, target, type Acting } from '../investigation/acting.ts';
import type { Actor } from '../kernel/actor.ts';
import { authorizeActingFor } from '../kernel/authorization.ts';
import type { WorldState } from '../kernel/state.ts';

/**
 * Whether a character can talk to an NPC now (docs/adr/0020-npc-intelligence.md
 * §1, §3). Talk is no command: nothing is recorded. It is authorized as a
 * player command is, and its preconditions are those of `AskAbout` without a
 * topic, in the same order, so a refusal reveals no more than a command's
 * rejection would.
 */
export type TalkCheck =
  | { readonly ok: true; readonly speaker: Acting }
  | { readonly ok: false; readonly code: RejectionCode };

const refuse = (code: RejectionCode): TalkCheck => ({ ok: false, code });

export function checkTalk(
  state: WorldState,
  actor: Actor,
  characterId: string,
  npcId: string,
): TalkCheck {
  const authorization = authorizeActingFor(state, actor, characterId);
  if (!authorization.ok) return refuse(authorization.rejection.code);
  const speaker = acting(state, characterId);
  if (!speaker.ok) return refuse(speaker.rejection.code);
  if (isIncapacitated(speaker.value)) return refuse('ACTOR_INCAPACITATED');
  const found = target(state, speaker.value, npcId);
  if (!found.ok) return refuse(found.rejection.code);
  if (!speaker.value.perceived.has(npcId)) return refuse('NOT_PRESENT');
  if (found.value.entity.status !== 'active') return refuse('TARGET_DEAD');
  if (found.value.entity.kind !== 'npc' || npcId === characterId) return refuse('NO_EFFECT');
  return { ok: true, speaker: speaker.value };
}
