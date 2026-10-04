import type { ProposableCommand } from '@ltw/contracts';

import type { ResolvedProposable } from '../../kernel/decision.ts';
import type { DraftOption } from './describe.ts';

/**
 * Edits that options propose (docs/adr/0019-continuity-engine.md §1). Each
 * returns a whole new command list; nothing here changes a stored revision.
 */
type Commands = readonly ResolvedProposable[];

export function replaced(
  commands: Commands,
  index: number,
  command: ResolvedProposable,
): ResolvedProposable[] {
  return commands.map((existing, position) => (position === index ? command : existing));
}

export const edit = (label: string, commands: readonly ProposableCommand[]): DraftOption => ({
  kind: 'edit',
  label,
  commands,
});

/** What an operation creates or targets, so its dependents can go with it. */
function dependsOn(
  command: ResolvedProposable,
  entities: ReadonlySet<string>,
  records: ReadonlySet<string>,
): boolean {
  switch (command.type) {
    case 'AddKnowledge':
      return (
        (command.scope.kind === 'NPC' && entities.has(command.scope.npcId)) ||
        (command.subjects ?? []).some((id) => entities.has(id)) ||
        (command.attributedTo !== undefined && entities.has(command.attributedTo))
      );
    case 'SetDisclosure':
      return records.has(command.knowledgeId);
    case 'SetClaim':
      return command.target.kind === 'knowledge' && records.has(command.target.knowledgeId);
    case 'PlaceEntity':
    case 'UpdateEntityProfile':
    case 'ChangeEntityStatus':
      return entities.has(command.entityId);
    case 'SetRelationship':
      return entities.has(command.npcId);
    case 'CreateEntity':
    case 'AdvanceWorldTime':
      return false;
  }
}

/**
 * Leaves out one operation and everything that depends on it: what a removed
 * NPC holds or is named in, and the disclosures and claims of removed records.
 * Null when nothing would be left.
 */
export function withoutOperation(commands: Commands, index: number): ResolvedProposable[] | null {
  const removed = new Set([index]);
  const entities = new Set<string>();
  const records = new Set<string>();
  const note = (command: ResolvedProposable) => {
    if (command.type === 'CreateEntity') entities.add(command.entityId);
    if (command.type === 'AddKnowledge') records.add(command.knowledgeId);
  };
  const first = commands[index];
  if (first) note(first);
  let changed = true;
  while (changed) {
    changed = false;
    commands.forEach((command, position) => {
      if (removed.has(position) || !dependsOn(command, entities, records)) return;
      removed.add(position);
      note(command);
      changed = true;
    });
  }
  const kept = commands.filter((_, position) => !removed.has(position));
  return kept.length > 0 ? kept : null;
}

export function removal(
  commands: Commands,
  index: number,
  label = 'Leave this operation out',
): DraftOption[] {
  const kept = withoutOperation(commands, index);
  return kept === null ? [] : [{ kind: 'remove', label, commands: kept }];
}
