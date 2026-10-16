import type { EntityRef, KnowledgeScope, ProposableCommand } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

import { nameFor } from './command-text.ts';

/** Who holds a record of each scope, in the DM's words. */
function holder(t: Translate, scope: KnowledgeScope, who: (id: string) => string): string {
  switch (scope.kind) {
    case 'NPC':
      return t('{name} alone holds this account', { name: who(scope.npcId) });
    case 'CHARACTER':
      return t('{name} alone knows this', { name: who(scope.characterId) });
    case 'PARTY':
      return t('The whole party knows this');
    case 'PUBLIC':
      return t('Anyone may know this');
    case 'DM':
      return t('Only you, the DM, know this');
    case 'WORLD_TRUTH':
      return t('It is world truth: no one is told it');
  }
}

/**
 * "Who will see" for an authoring proposal (docs/STAGE_320_DESIGN.md §5.7), read from the
 * proposed commands alone: the proposal is the DM's until confirmed (ADR 0018), each record is
 * held by the scope its command names, an account marked willing is told when asked, and the
 * players meet what is created only through their characters, in play (invariant 5). Nothing
 * here decides visibility; the server's projections do.
 */
export function whoWillSee(
  t: Translate,
  commands: readonly ProposableCommand[],
  directory: readonly EntityRef[],
  names: ReadonlyMap<string, string> = new Map(),
): readonly string[] {
  const who = (id: string) => names.get(id) ?? nameFor(directory, id);
  const lines = [t('Until you confirm it, only you see this proposal.')];
  const held = new Map<string, KnowledgeScope>();
  for (const command of commands) {
    if (command.type === 'CreateEntity') {
      lines.push(
        t('Players learn of {name} only through their characters, in play.', {
          name: command.name,
        }),
      );
    } else if (command.type === 'AddKnowledge') {
      if (command.knowledgeId !== undefined) held.set(command.knowledgeId, command.scope);
      lines.push(holder(t, command.scope, who));
    } else if (command.type === 'SetDisclosure' && command.disclosure === 'WILLING') {
      const scope = held.get(command.knowledgeId);
      lines.push(
        scope?.kind === 'NPC'
          ? t('{name} will tell it when asked', { name: who(scope.npcId) })
          : t('It will be told when asked'),
      );
    }
  }
  return lines;
}
