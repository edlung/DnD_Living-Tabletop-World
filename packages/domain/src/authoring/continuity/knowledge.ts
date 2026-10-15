import type { ResolvedProposable } from '../../kernel/decision.ts';
import { scopeKey } from '../../knowledge/records.ts';
import { RESERVED_ATTITUDES, attitudeOf } from '../../relationships/records.ts';
import { mentionedBy } from '../policy.ts';
import {
  ACKNOWLEDGE,
  findingKey,
  nameOf,
  normalized,
  type ContinuityInput,
  type WarningDraft,
  voice,
} from './describe.ts';
import { edit, removal, replaced } from './edits.ts';

/**
 * Knowledge and relationships (docs/adr/0018-ai-authoring.md §3,
 * docs/adr/0019-continuity-engine.md §2–§3): secrets an NPC would learn,
 * accounts it already holds, and sharing against its attitude.
 */

/** Warning: an NPC's record about an entity neither the public nor the party knows. */
export function secretSubject(
  input: ContinuityInput,
  command: ResolvedProposable,
  index: number,
): WarningDraft[] {
  if (command.type !== 'AddKnowledge' || command.scope.kind !== 'NPC') return [];
  const holder = command.scope.npcId;
  return mentionedBy(command)
    .filter((id) => !input.open.has(id))
    .map((id) => {
      const subjects = (command.subjects ?? []).filter((subject) => subject !== id);
      const leaveOut =
        command.attributedTo !== id
          ? [
              edit(
                voice(input.state).say('Leave {name} out of the record', {
                  name: nameOf(input.state, id),
                }),
                replaced(input.commands, index, { ...command, subjects }),
              ),
            ]
          : [];
      return {
        key: findingKey('SECRET_SUBJECT', index, id),
        code: 'SECRET_SUBJECT' as const,
        commandIndex: index,
        entityIds: [holder, id],
        knowledgeIds: [command.knowledgeId],
        message: voice(input.state).say(
          '{holder} would know about {id}, which neither the public nor the party knows',
          { holder: nameOf(input.state, holder), id: nameOf(input.state, id) },
        ),
        options: [...leaveOut, ACKNOWLEDGE],
      };
    });
}

/** Warning: the holder already holds this account. */
export function duplicateAccount(
  input: ContinuityInput,
  command: ResolvedProposable,
  index: number,
): WarningDraft[] {
  if (command.type !== 'AddKnowledge' || command.scope.kind !== 'NPC') return [];
  const scope = scopeKey(command.scope);
  const statement = normalized(command.statement);
  const twin = [...input.before.knowledge.values()].find(
    (record) => scopeKey(record.scope) === scope && normalized(record.statement) === statement,
  );
  if (!twin) return [];
  return [
    {
      key: findingKey('DUPLICATE_ACCOUNT', index, twin.knowledgeId),
      code: 'DUPLICATE_ACCOUNT',
      commandIndex: index,
      entityIds: [command.scope.npcId],
      knowledgeIds: [twin.knowledgeId, command.knowledgeId],
      message: voice(input.state).say('{name} already holds this account ({id})', {
        name: nameOf(input.state, command.scope.npcId),
        id: twin.knowledgeId,
      }),
      options: [...removal(input.commands, index), ACKNOWLEDGE],
    },
  ];
}

/** Warning: a hostile or wary NPC is made willing to share a record with the party. */
export function disclosureAgainstAttitude(
  input: ContinuityInput,
  command: ResolvedProposable,
  index: number,
): WarningDraft[] {
  if (command.type !== 'SetDisclosure' || command.disclosure !== 'WILLING') return [];
  const record = input.state.knowledge.get(command.knowledgeId);
  if (record?.scope.kind !== 'NPC') return [];
  const npcId = record.scope.npcId;
  const attitude = attitudeOf(input.state, npcId);
  if (!RESERVED_ATTITUDES.has(attitude)) return [];
  return [
    {
      key: findingKey('DISCLOSURE_AGAINST_ATTITUDE', index, npcId),
      code: 'DISCLOSURE_AGAINST_ATTITUDE',
      commandIndex: index,
      entityIds: [npcId],
      knowledgeIds: [command.knowledgeId],
      message: voice(input.state).say(
        '{name} is {attitude} toward the party, yet would share this willingly',
        {
          name: nameOf(input.state, npcId),
          attitude: voice(input.state).say(attitude.toLowerCase()),
        },
      ),
      options: [...removal(input.commands, index, 'Keep it guarded'), ACKNOWLEDGE],
    },
  ];
}
