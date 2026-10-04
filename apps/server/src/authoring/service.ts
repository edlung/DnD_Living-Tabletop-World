import type { AiTraceStore } from '@ltw/ai';
import {
  proposalCommandsSchema,
  type AuthoringProposalResponse,
  type AuthoringProposalView,
  type CommandRejected,
  type CommandResult,
  type CommitProposalRequest,
  type CreateProposalRequest,
  type ProposableCommand,
  type ReviseProposalRequest,
} from '@ltw/contracts';
import {
  authoringCommandId,
  campaignRole,
  previewAuthoring,
  type Actor,
  type CampaignSnapshot,
  type IdGenerator,
  type ResolvedProposable,
  type WallClock,
  type WorldEngine,
} from '@ltw/domain';

import {
  ProposalConflictError,
  type ProposalRevision,
  type ProposalStore,
} from './proposal-store.ts';

/**
 * The authoring application service (docs/adr/0018-ai-authoring.md §5–§8):
 * proposals and their revisions, previews against the current world, the
 * DM's confirmed commit as one `ApplyAuthoring` command, and its undo. DM
 * only. Every legality and consent rule is the World Engine's; this service
 * only keeps proposals and binds a commit to the latest revision.
 *
 * An edit, a commit, and an undo each check and act inside the proposal's
 * exclusive section (`ProposalStore.exclusive`), reading canon there, so
 * they take turns across processes: an edit after a commit, or a commit of
 * a revision an edit replaced, is a conflict (Gate 04, G04-H01).
 */
export interface AuthoringDependencies {
  readonly proposals: ProposalStore;
  readonly ids: IdGenerator;
  readonly clock: WallClock;
}

export type AuthoringOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | {
      readonly kind: 'error';
      readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'UNPROCESSABLE';
    }
  | { readonly kind: 'rejected'; readonly result: CommandRejected };

const ok = <T>(value: T): AuthoringOutcome<T> => ({ kind: 'ok', value });
const error = <T>(
  code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'UNPROCESSABLE',
): AuthoringOutcome<T> => ({ kind: 'error', code });

/** One commit per proposal: the World Engine's idempotency key (§5). */
export const commitCommandId = authoringCommandId;

export class AuthoringService {
  readonly #engine: WorldEngine;
  readonly #traces: AiTraceStore;
  readonly #deps: AuthoringDependencies;

  constructor(engine: WorldEngine, traces: AiTraceStore, deps: AuthoringDependencies) {
    this.#engine = engine;
    this.#traces = traces;
    this.#deps = deps;
  }

  async create(
    actor: Actor,
    campaignId: string,
    request: CreateProposalRequest,
  ): Promise<AuthoringOutcome<AuthoringProposalResponse>> {
    const snapshot = await this.#asDm(actor, campaignId);
    if (snapshot.kind !== 'ok') return snapshot;
    let content: Pick<ProposalRevision, 'summary' | 'source'> & {
      readonly commands: readonly ProposableCommand[];
    };
    if ('traceId' in request) {
      // The AI's proposal comes from its trace, never from the client (§5).
      const trace = await this.#traces.get(campaignId, request.traceId);
      if (!trace) return error('NOT_FOUND');
      // Only a DM intent's valid proposal; an NPC's reply is never a proposal.
      if (trace.purpose !== 'dm-intent' || trace.status !== 'PROPOSED' || !trace.proposal) {
        return error('UNPROCESSABLE');
      }
      content = {
        summary: trace.proposal.summary,
        source: { kind: 'ai', traceId: trace.traceId },
        commands: trace.proposal.commands,
      };
    } else {
      content = { summary: request.summary, source: { kind: 'dm' }, commands: request.commands };
    }
    const revision: ProposalRevision = {
      campaignId,
      proposalId: this.#deps.ids.next(),
      revision: 1,
      ...content,
      commands: this.#resolved(content.commands),
      appliedOption: null,
      createdBy: actor.actorId,
      createdAt: this.#deps.clock.now(),
    };
    await this.#deps.proposals.append(revision);
    return ok(await this.#response(snapshot.value, actor, revision));
  }

  async view(
    actor: Actor,
    campaignId: string,
    proposalId: string,
  ): Promise<AuthoringOutcome<AuthoringProposalResponse>> {
    const snapshot = await this.#asDm(actor, campaignId);
    if (snapshot.kind !== 'ok') return snapshot;
    const latest = await this.#deps.proposals.latest(campaignId, proposalId);
    if (!latest) return error('NOT_FOUND');
    return ok(await this.#response(snapshot.value, actor, latest));
  }

  /**
   * An edit: a new revision of a draft, which voids every earlier preview and
   * confirmation. Either the DM's own commands, or one option of the latest
   * revision's preview, recomputed against the world now (ADR 0019 §1). An
   * option that no longer exists is a conflict; an acknowledgement is given
   * with the commit, not as a revision.
   */
  async revise(
    actor: Actor,
    campaignId: string,
    proposalId: string,
    request: ReviseProposalRequest,
  ): Promise<AuthoringOutcome<AuthoringProposalResponse>> {
    const allowed = await this.#asDm(actor, campaignId);
    if (allowed.kind !== 'ok') return allowed;
    return this.#deps.proposals.exclusive(campaignId, proposalId, async () => {
      const latest = await this.#deps.proposals.latest(campaignId, proposalId);
      if (!latest) return error('NOT_FOUND');
      const snapshot = await this.#engine.load(campaignId);
      if (!snapshot) return error('NOT_FOUND');
      if (committed(snapshot, proposalId) || request.basedOnRevision !== latest.revision) {
        return error('CONFLICT');
      }
      let edited: Pick<ProposalRevision, 'summary' | 'appliedOption'> & {
        readonly commands: readonly ProposableCommand[];
      };
      if ('optionId' in request) {
        const preview = previewAuthoring(snapshot, actor, { ...latest });
        const option = [...preview.issues, ...preview.warnings]
          .flatMap((finding) => finding.options ?? [])
          .find((candidate) => candidate.optionId === request.optionId);
        if (!option) return error('CONFLICT');
        if (option.commands === null) return error('UNPROCESSABLE');
        const commands = proposalCommandsSchema.safeParse(option.commands);
        if (!commands.success) return error('UNPROCESSABLE');
        edited = {
          summary: latest.summary,
          commands: commands.data,
          appliedOption: { optionId: option.optionId, label: option.label },
        };
      } else {
        edited = {
          summary: request.summary ?? latest.summary,
          commands: request.commands,
          appliedOption: null,
        };
      }
      const revision: ProposalRevision = {
        ...latest,
        revision: latest.revision + 1,
        summary: edited.summary,
        commands: this.#resolved(edited.commands),
        appliedOption: edited.appliedOption ?? null,
        createdBy: actor.actorId,
        createdAt: this.#deps.clock.now(),
      };
      try {
        await this.#deps.proposals.append(revision);
      } catch (cause) {
        if (cause instanceof ProposalConflictError) return error('CONFLICT');
        throw cause;
      }
      return ok(await this.#response(snapshot, actor, revision));
    });
  }

  /**
   * The DM's confirmed commit of the latest revision; decided by the World
   * Engine now. One commit per proposal: the engine answers an identical
   * retry with the original command (`duplicate`) and any other second
   * commit with `COMMAND_ID_CONFLICT`, here a conflict (ADR 0018 §5, G04-M02).
   */
  async commit(
    actor: Actor,
    campaignId: string,
    proposalId: string,
    request: CommitProposalRequest,
  ): Promise<AuthoringOutcome<CommandResult>> {
    const allowed = await this.#asDm(actor, campaignId);
    if (allowed.kind !== 'ok') return allowed;
    return this.#deps.proposals.exclusive(campaignId, proposalId, async () => {
      const latest = await this.#deps.proposals.latest(campaignId, proposalId);
      if (!latest) return error('NOT_FOUND');
      // An edit voids every earlier revision's confirmation.
      if (request.revision !== latest.revision) return error('CONFLICT');
      const result = await this.#engine.execute({
        commandId: commitCommandId(proposalId),
        campaignId,
        actor,
        command: {
          type: 'ApplyAuthoring',
          proposalId,
          revision: latest.revision,
          summary: latest.summary,
          source: latest.source,
          commands: latest.commands,
          confirmation: request.confirmation,
        },
      });
      if (result.status !== 'rejected') return ok(result);
      if (result.code === 'COMMAND_ID_CONFLICT') return error('CONFLICT');
      return { kind: 'rejected', result };
    });
  }

  /** Undoes the commit as one unit; blockers are listed when anything depends on it (§7). */
  async undo(
    actor: Actor,
    campaignId: string,
    proposalId: string,
  ): Promise<AuthoringOutcome<CommandResult>> {
    const allowed = await this.#asDm(actor, campaignId);
    if (allowed.kind !== 'ok') return allowed;
    return this.#deps.proposals.exclusive(campaignId, proposalId, async () => {
      if (!(await this.#deps.proposals.latest(campaignId, proposalId))) return error('NOT_FOUND');
      const snapshot = await this.#engine.load(campaignId);
      if (!snapshot || !committed(snapshot, proposalId)) return error('CONFLICT');
      const result = await this.#engine.execute({
        commandId: `${commitCommandId(proposalId)}.undo`,
        campaignId,
        actor,
        command: { type: 'UndoCommand', targetCommandId: commitCommandId(proposalId) },
      });
      return result.status === 'rejected' ? { kind: 'rejected', result } : ok(result);
    });
  }

  /** ADR 0009 order after input checks: membership (404), then role (403). */
  async #asDm(actor: Actor, campaignId: string): Promise<AuthoringOutcome<CampaignSnapshot>> {
    const snapshot = await this.#engine.load(campaignId);
    const role = campaignRole(snapshot?.state ?? null, actor);
    if (!snapshot || role === null) return error('NOT_FOUND');
    return role === 'DM' ? ok(snapshot) : error('FORBIDDEN');
  }

  /** Generated IDs are fixed when a revision is stored, so a preview shows what commits. */
  #resolved(commands: readonly ProposableCommand[]): ResolvedProposable[] {
    return commands.map((command) =>
      command.type === 'CreateEntity'
        ? { ...command, entityId: command.entityId ?? this.#deps.ids.next() }
        : command.type === 'AddKnowledge'
          ? { ...command, knowledgeId: command.knowledgeId ?? this.#deps.ids.next() }
          : command,
    );
  }

  async #response(
    snapshot: CampaignSnapshot,
    actor: Actor,
    revision: ProposalRevision,
  ): Promise<AuthoringProposalResponse> {
    const proposal = await this.#view(snapshot, revision);
    return {
      proposal,
      preview:
        proposal.status === 'DRAFT' ? previewAuthoring(snapshot, actor, { ...revision }) : null,
    };
  }

  async #view(
    snapshot: CampaignSnapshot,
    revision: ProposalRevision,
  ): Promise<AuthoringProposalView> {
    const commandId = commitCommandId(revision.proposalId);
    const trace = snapshot.state.commands.get(commandId);
    const { campaignId, proposalId, summary, source, commands, createdBy, createdAt } = revision;
    const base = {
      proposalId,
      campaignId,
      revision: revision.revision,
      summary,
      source,
      commands,
      createdBy,
      createdAt,
      appliedOption: revision.appliedOption ?? null,
    };
    if (!trace) return { ...base, status: 'DRAFT', commit: null };
    const stored = (await this.#engine.commandLog(campaignId)).find(
      (command) => command.commandId === commandId,
    );
    return {
      ...base,
      status: trace.undoneBy === null ? 'COMMITTED' : 'UNDONE',
      commit: {
        commandId,
        revision: stored?.command.type === 'ApplyAuthoring' ? stored.command.revision : 0,
        events: snapshot.history
          .filter((event) => event.causation.commandId === commandId)
          .map(({ sequence, eventId, type }) => ({ sequence, eventId, type })),
        undoneBy: trace.undoneBy,
      },
    };
  }
}

const committed = (snapshot: CampaignSnapshot, proposalId: string) =>
  snapshot.state.commands.has(commitCommandId(proposalId));
