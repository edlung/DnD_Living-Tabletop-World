import { formatPerspective, type PerspectiveRequest } from '@ltw/contracts';

import type { Actor } from '../kernel/actor.ts';
import type { WorldState } from '../kernel/state.ts';

/**
 * Perspective resolution and authorization (docs/adr/0008-knowledge-boundary.md).
 *
 * Order matters for leakage: campaign membership first (non-members learn
 * nothing, not even that the campaign exists), then permission decided from
 * the actor's own role only — never from whether the requested target
 * exists. Nothing ever falls back to a broader perspective.
 */
export type CampaignRole = 'DM' | 'SYSTEM' | 'PLAYER';

export interface ResolvedPerspective {
  /** Effective perspective label, e.g. `PARTY` or `CHARACTER:elowen-starwhisper`. */
  readonly label: string;
  readonly kind: 'DM' | 'PUBLIC' | 'PARTY' | 'CHARACTER' | 'NPC';
  /** The character or NPC whose view this is; null for collective views. */
  readonly holderId: string | null;
  /** Scope keys whose records are visible; `ALL` only for the DM view. */
  readonly scopes: ReadonlySet<string> | 'ALL';
}

export type PerspectiveAccess =
  | { readonly ok: true; readonly perspective: ResolvedPerspective }
  | { readonly ok: false; readonly reason: 'NOT_FOUND' | 'FORBIDDEN' };

const NOT_FOUND = { ok: false, reason: 'NOT_FOUND' } as const;
const FORBIDDEN = { ok: false, reason: 'FORBIDDEN' } as const;

export function campaignRole(state: WorldState | null, actor: Actor): CampaignRole | null {
  if (!state?.campaign) return null;
  if (actor.kind === 'system') return 'SYSTEM';
  if (actor.actorId === state.campaign.dmActorId) return 'DM';
  return controlledCharacter(state, actor.actorId) === null ? null : 'PLAYER';
}

export function controlledCharacter(state: WorldState, actorId: string): string | null {
  for (const [characterId, playerId] of state.roster) {
    if (playerId === actorId) return characterId;
  }
  return null;
}

export function resolvePerspective(
  state: WorldState | null,
  actor: Actor,
  request: PerspectiveRequest,
): PerspectiveAccess {
  const role = campaignRole(state, actor);
  if (state === null || role === null) return NOT_FOUND;

  if (role === 'PLAYER') {
    const own = controlledCharacter(state, actor.actorId);
    switch (request.kind) {
      case 'PUBLIC':
      case 'PARTY':
        return granted(state, request.kind, null);
      case 'PLAYER':
        return own === null ? FORBIDDEN : granted(state, 'CHARACTER', own);
      case 'CHARACTER':
        return request.characterId === own ? granted(state, 'CHARACTER', own) : FORBIDDEN;
      default:
        return FORBIDDEN;
    }
  }

  // DM or trusted system process: any perspective, but targets must be real.
  switch (request.kind) {
    case 'DM':
    case 'PUBLIC':
    case 'PARTY':
      return granted(state, request.kind, null);
    case 'PLAYER':
      return FORBIDDEN;
    case 'CHARACTER':
      return state.entities.get(request.characterId)?.kind === 'character'
        ? granted(state, 'CHARACTER', request.characterId)
        : NOT_FOUND;
    case 'NPC':
      return state.entities.get(request.npcId)?.kind === 'npc'
        ? granted(state, 'NPC', request.npcId)
        : NOT_FOUND;
  }
}

function granted(
  state: WorldState,
  kind: ResolvedPerspective['kind'],
  holderId: string | null,
): PerspectiveAccess {
  const scopes = new Set(['PUBLIC']);
  let request: PerspectiveRequest;
  switch (kind) {
    case 'DM':
      return { ok: true, perspective: { label: 'DM', kind, holderId: null, scopes: 'ALL' } };
    case 'PUBLIC':
      request = { kind };
      break;
    case 'PARTY':
      scopes.add('PARTY');
      request = { kind };
      break;
    case 'CHARACTER': {
      const characterId = holderId ?? '';
      scopes.add(`CHARACTER:${characterId}`);
      if (state.roster.has(characterId)) scopes.add('PARTY');
      request = { kind, characterId };
      break;
    }
    case 'NPC': {
      const npcId = holderId ?? '';
      scopes.add(`NPC:${npcId}`);
      request = { kind, npcId };
      break;
    }
  }
  return { ok: true, perspective: { label: formatPerspective(request), kind, holderId, scopes } };
}
