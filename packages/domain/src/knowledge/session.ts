import type { SessionResponse } from '@ltw/contracts';

import type { Actor } from '../kernel/actor.ts';
import type { WorldState } from '../kernel/state.ts';
import { languageOf } from '../language/index.ts';
import { sessionText } from '../language/session-text.ts';
import { campaignRole, controlledCharacter, resolvePerspective } from './perspective.ts';
import { entityRef } from './projection.ts';
import { knownEntities } from './queries.ts';

/** Identity is independent of the selected view; no other player's actor ID is exposed. */
export function campaignSession(state: WorldState, actor: Actor): SessionResponse | null {
  const role = campaignRole(state, actor);
  if (!state.campaign || role === null || role === 'SYSTEM' || role === 'DISPLAY') return null;
  const words = sessionText(languageOf(state));
  const ownId = role === 'PLAYER' ? controlledCharacter(state, actor.actorId) : null;
  const character = ownId === null ? null : entityRef(state, ownId);
  const perspectives =
    role === 'PLAYER' && character
      ? [
          { value: 'PLAYER', label: words.player(character.name) },
          { value: `CHARACTER:${character.entityId}`, label: character.name },
        ]
      : [{ value: 'DM', label: words.dungeonMaster }];
  perspectives.push(
    { value: 'PARTY', label: words.party },
    { value: 'PUBLIC', label: words.publicView },
  );
  if (role === 'DM') {
    const access = resolvePerspective(state, actor, { kind: 'DM' });
    if (!access.ok) return null;
    for (const entity of knownEntities(state, access.perspective)) {
      if (entity.kind === 'character') {
        perspectives.push({ value: `CHARACTER:${entity.entityId}`, label: entity.name });
      }
    }
  }
  return {
    actorId: actor.actorId,
    role,
    character,
    campaign: {
      campaignId: state.campaign.campaignId,
      name: state.campaign.name,
      language: state.campaign.language,
    },
    perspectives,
  };
}
