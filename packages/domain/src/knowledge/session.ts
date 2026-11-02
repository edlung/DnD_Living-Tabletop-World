import type { SessionResponse } from '@ltw/contracts';

import type { Actor } from '../kernel/actor.ts';
import type { WorldState } from '../kernel/state.ts';
import { languageOf } from '../language/index.ts';
import { sessionText } from '../language/session-text.ts';
import { campaignRole, controlledCharacters, resolvePerspective } from './perspective.ts';
import { entityRef } from './projection.ts';
import { knownEntities } from './queries.ts';

/** Identity is independent of the selected view; no other player's actor ID is exposed. */
export function campaignSession(state: WorldState, actor: Actor): SessionResponse | null {
  const role = campaignRole(state, actor);
  if (!state.campaign || role === null || role === 'SYSTEM' || role === 'DISPLAY') return null;
  const words = sessionText(languageOf(state));
  // A player's characters, the first first (ADR 0044 §6): one perspective each.
  const characters =
    role === 'PLAYER'
      ? controlledCharacters(state, actor.actorId).map((id) => entityRef(state, id))
      : [];
  const character = characters[0] ?? null;
  const perspectives =
    role === 'PLAYER' && character
      ? [
          { value: 'PLAYER', label: words.player(character.name) },
          ...characters.map((own) => ({ value: `CHARACTER:${own.entityId}`, label: own.name })),
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
    characters,
    campaign: {
      campaignId: state.campaign.campaignId,
      name: state.campaign.name,
      language: state.campaign.language,
    },
    perspectives,
  };
}
