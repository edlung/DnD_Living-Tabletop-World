import {
  commandProposalSchema,
  type CommandProposal,
  type ProposableCommand,
} from '@ltw/contracts';

/**
 * Structured-output validation (docs/adr/0017-ai-gateway.md §4): the shape
 * through the World Engine's own command schemas, then every entity a
 * command names must be in the context's directory or created earlier in
 * the same proposal; a disclosure, a record the proposal adds. Passing makes
 * a proposal reviewable, never committable: the authoring pipeline decides
 * that against the world at commit (docs/adr/0018-ai-authoring.md).
 */
export type ProposalCheck =
  | { readonly ok: true; readonly proposal: CommandProposal }
  | { readonly ok: false; readonly issues: readonly string[] };

const MAX_ISSUES = 20;

/** The entity IDs a command reads, by field. */
function references(command: ProposableCommand): [string, string][] {
  switch (command.type) {
    case 'CreateEntity':
      return [
        ...(command.placement ? [['placement.locationId', command.placement.locationId]] : []),
        ...(command.location?.parentId ? [['location.parentId', command.location.parentId]] : []),
      ] as [string, string][];
    case 'PlaceEntity':
      return [
        ['entityId', command.entityId],
        ['locationId', command.locationId],
      ];
    case 'UpdateEntityProfile':
    case 'ChangeEntityStatus':
      return [['entityId', command.entityId]];
    case 'AdvanceWorldTime':
    case 'SetDisclosure':
      return [];
    case 'AddKnowledge': {
      const holder =
        command.scope.kind === 'NPC'
          ? [['scope.npcId', command.scope.npcId]]
          : command.scope.kind === 'CHARACTER'
            ? [['scope.characterId', command.scope.characterId]]
            : [];
      return [
        ...holder,
        ...(command.subjects ?? []).map((id, index) => [`subjects.${String(index)}`, id]),
        ...(command.attributedTo ? [['attributedTo', command.attributedTo]] : []),
      ] as [string, string][];
    }
  }
}

export function validateProposal(output: unknown, directory: ReadonlySet<string>): ProposalCheck {
  const parsed = commandProposalSchema.safeParse(output);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues
        .slice(0, MAX_ISSUES)
        .map((issue) => `${issue.path.join('.') || '(output)'}: ${issue.message}`),
    };
  }
  const known = new Set(directory);
  // The directory holds no records: a disclosure may only name a record the proposal adds.
  const records = new Set<string>();
  const issues: string[] = [];
  parsed.data.commands.forEach((command, index) => {
    const at = `commands.${String(index)}`;
    for (const [field, id] of references(command)) {
      if (!known.has(id)) issues.push(`${at}.${field}: unknown entity "${id}"`);
    }
    if (command.type === 'SetDisclosure' && !records.has(command.knowledgeId)) {
      issues.push(`${at}.knowledgeId: unknown record "${command.knowledgeId}"`);
    }
    if (command.type === 'AddKnowledge' && command.knowledgeId !== undefined) {
      records.add(command.knowledgeId);
    }
    if (command.type === 'CreateEntity' && command.entityId !== undefined) {
      if (known.has(command.entityId)) {
        issues.push(`${at}.entityId: "${command.entityId}" already exists`);
      }
      known.add(command.entityId);
    }
  });
  return issues.length > 0
    ? { ok: false, issues: issues.slice(0, MAX_ISSUES) }
    : { ok: true, proposal: parsed.data };
}
