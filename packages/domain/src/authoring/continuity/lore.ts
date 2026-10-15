import type { KnowledgeClaim } from '@ltw/contracts';

import type { ResolvedProposable } from '../../kernel/decision.ts';
import type { WorldState } from '../../kernel/state.ts';
import {
  ACKNOWLEDGE,
  findingKey,
  nameOf,
  type ContinuityInput,
  type NoteDraft,
  type WarningDraft,
  voice,
} from './describe.ts';
import { edit, removal, replaced } from './edits.ts';

/**
 * Lore as claims (docs/adr/0019-continuity-engine.md §4, owner decision): each
 * claim a proposal sets is compared with every other claim on the same
 * subject and aspect, in every scope (world truth included) and on clues. A
 * different value warns; the same value is noted. Free text is never compared.
 * DM data only: these findings name values and whose accounts hold them.
 */
interface Claimed {
  readonly id: string;
  readonly claim: KnowledgeClaim;
  /** Whose account, for the explanation. */
  readonly whose: string;
}

function claimsOf(state: WorldState): Claimed[] {
  const v = voice(state);

  const records = [...state.epistemics.claims].map(([knowledgeId, claim]) => {
    const record = state.knowledge.get(knowledgeId);
    const whose =
      record?.scope.kind === 'WORLD_TRUTH'
        ? v.say('the world truth ({id})', { id: knowledgeId })
        : record?.attributedTo
          ? v.say("{name}'s account ({id})", {
              name: nameOf(state, record.attributedTo),
              id: knowledgeId,
            })
          : v.say('the {type} {id}', {
              type: v.say(record?.knowledgeType.toLowerCase() ?? 'record'),
              id: knowledgeId,
            });
    return { id: knowledgeId, claim, whose };
  });
  const clues = [...state.epistemics.clueClaims].map(([clueId, claim]) => ({
    id: clueId,
    claim,
    whose: v.say('the clue {id}', { id: clueId }),
  }));
  return [...records, ...clues];
}

export function claimFindings(
  input: ContinuityInput,
  command: ResolvedProposable,
  index: number,
): { readonly warnings: WarningDraft[]; readonly notes: NoteDraft[] } {
  if (command.type !== 'SetClaim' || command.target.kind !== 'knowledge') {
    return { warnings: [], notes: [] };
  }
  const own = command.target.knowledgeId;
  const { claim } = command;
  const related = claimsOf(input.state).filter(
    (other) =>
      other.id !== own &&
      other.claim.subjectId === claim.subjectId &&
      other.claim.aspect === claim.aspect,
  );
  const v = voice(input.state);
  const about = `${nameOf(input.state, claim.subjectId)} (${claim.aspect})`;
  const warnings = related
    .filter((other) => other.claim.value !== claim.value)
    .map((other): WarningDraft => ({
      key: findingKey('CLAIM_CONFLICT', index, other.id),
      code: 'CLAIM_CONFLICT',
      commandIndex: index,
      entityIds: [claim.subjectId],
      knowledgeIds: [own, other.id],
      message: v.say('About {about}: this says {value}; {whose} says {other}', {
        about,
        value: claim.value,
        whose: other.whose,
        other: other.claim.value,
      }),
      options: [
        edit(
          v.say('Agree with {whose}: {value}', { whose: other.whose, value: other.claim.value }),
          replaced(input.commands, index, {
            ...command,
            claim: { ...claim, value: other.claim.value },
          }),
        ),
        ...removal(input.commands, index, 'Leave the claim out'),
        ACKNOWLEDGE,
      ],
    }));
  const notes = related
    .filter((other) => other.claim.value === claim.value)
    .map((other): NoteDraft => ({
      code: 'CLAIM_AGREES',
      commandIndex: index,
      entityIds: [claim.subjectId],
      knowledgeIds: [own, other.id],
      message: v.say('About {about}: agrees with {whose} ({value})', {
        about,
        whose: other.whose,
        value: claim.value,
      }),
    }));
  return { warnings, notes };
}
