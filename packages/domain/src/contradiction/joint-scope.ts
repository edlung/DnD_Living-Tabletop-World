import type { KnowledgeScope } from '@ltw/contracts';

import type { WorldState } from '../kernel/state.ts';
import { isHolderScope, type HolderScope } from './records.ts';

/**
 * The one holder scope whose whole audience sees records of both scopes
 * (docs/adr/0014-contradictions-and-epistemic-integrity.md §2), or null.
 * Its audience is a subset of each record's audience, so a contradiction
 * recorded there never tells anyone about a record they cannot see.
 *
 * PUBLIC + X → X · PARTY + PARTY → PARTY · PARTY + CHARACTER(c) → CHARACTER(c)
 * if c is in the party · same CHARACTER / same NPC → that scope · else null.
 * WORLD_TRUTH and DM are never joined: truth is never compared with anything.
 */
export function jointScope(
  state: WorldState,
  a: KnowledgeScope,
  b: KnowledgeScope,
): HolderScope | null {
  if (!isHolderScope(a) || !isHolderScope(b)) return null;
  if (a.kind === 'PUBLIC') return copy(b);
  if (b.kind === 'PUBLIC') return copy(a);
  if (a.kind === 'PARTY' && b.kind === 'PARTY') return { kind: 'PARTY' };
  const other = a.kind === 'PARTY' ? b : b.kind === 'PARTY' ? a : null;
  if (other !== null) {
    return other.kind === 'CHARACTER' && state.roster.has(other.characterId) ? copy(other) : null;
  }
  if (a.kind === 'CHARACTER' && b.kind === 'CHARACTER') {
    return a.characterId === b.characterId ? copy(a) : null;
  }
  if (a.kind === 'NPC' && b.kind === 'NPC') return a.npcId === b.npcId ? copy(a) : null;
  return null;
}

function copy(scope: HolderScope): HolderScope {
  switch (scope.kind) {
    case 'CHARACTER':
      return { kind: 'CHARACTER', characterId: scope.characterId };
    case 'NPC':
      return { kind: 'NPC', npcId: scope.npcId };
    default:
      return { kind: scope.kind };
  }
}
